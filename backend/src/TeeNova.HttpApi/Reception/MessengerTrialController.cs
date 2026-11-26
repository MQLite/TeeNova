using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Volo.Abp.Auditing;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Reception;

[ApiController, AllowAnonymous, DisableAuditing]
[Route("api/messenger-trial/webhook")]
public class MessengerTrialController(IConfiguration configuration, IRepository<ReceptionSheet, Guid> sheets) : TeeNovaControllerBase
{
    internal const string PageId = "100470245028245";
    private const int MaxImageBytes = 256 * 1024;
    private readonly IConfigurationSection settings = configuration.GetSection("MessengerTrial");
    private static readonly HttpClient MediaClient = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
        PooledConnectionLifetime = TimeSpan.FromMinutes(5)
    }) { Timeout = TimeSpan.FromSeconds(4), MaxResponseContentBufferSize = MaxImageBytes };

    [HttpGet]
    public IActionResult Verify()
    {
        var token = settings["VerifyToken"];
        if (string.IsNullOrWhiteSpace(token)) return NotFound();
        var query = Request.Query;
        if (query["hub.mode"] != "subscribe" || query["hub.verify_token"] != token ||
            !long.TryParse(query["hub.challenge"], out _)) return Forbid();
        return Content(query["hub.challenge"].ToString(), "text/plain");
    }

    [HttpPost, RequestSizeLimit(1024 * 1024)]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        var secret = settings["AppSecret"];
        var staff = settings["StaffPsid"];
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(staff) ||
            !Guid.TryParse(settings["SheetId"], out var sheetId) || sheetId == Guid.Empty) return NotFound();
        using var body = new MemoryStream();
        await Request.Body.CopyToAsync(body, ct);
        var bytes = body.ToArray();
        var signature = Request.Headers["X-Hub-Signature-256"].ToString();
        if (!ValidSignature(bytes, signature, secret)) return Unauthorized();

        using var json = JsonDocument.Parse(bytes);
        if (Field(json.RootElement, "object") != "page") return Ok();
        foreach (var entry in Items(json.RootElement, "entry"))
        {
            if (Field(entry, "id") != PageId) continue;
            foreach (var item in Items(entry, "messaging"))
            {
                if (!item.TryGetProperty("sender", out var sender) || Field(sender, "id") != staff ||
                    !item.TryGetProperty("recipient", out var recipient) || Field(recipient, "id") != PageId ||
                    !item.TryGetProperty("message", out var message) || message.TryGetProperty("is_echo", out _) ||
                    Field(message, "mid") is not { Length: > 0 } mid ||
                    !item.TryGetProperty("timestamp", out var stamp) || !stamp.TryGetInt64(out var timestamp) || timestamp <= 0) continue;

                var confirmation = Field(message, "text")?.Trim() == MessengerTrialArtwork.Confirmation;
                var attachments = Items(message, "attachments").ToArray();
                if (!confirmation && !(attachments.Length == 1 && Field(attachments[0], "type") == "image")) continue;
                var sheet = await sheets.FindAsync(sheetId, cancellationToken: ct);
                if (sheet == null || sheet.Customer != MessengerTrialArtwork.SheetName) return StatusCode(503);
                if (sheet.IsTrialReady()) continue;
                if (confirmation) sheet.ConfirmTestImage(timestamp);
                else if (sheet.HasImage()) sheet.CheckRepeatedImage(mid);
                else
                {
                    if (!attachments[0].TryGetProperty("payload", out var payload) ||
                        !IsMetaImage(Field(payload, "url"), out var url)) continue;
                    var data = await MediaClient.GetByteArrayAsync(url!, ct);
                    var mime = GetImageMime(data);
                    if (mime == null) continue;
                    sheet.StoreTestImage(mid, timestamp, data, mime);
                }
                await sheets.UpdateAsync(sheet, autoSave: true, cancellationToken: ct);
            }
        }
        return Ok();
    }

    internal static bool ValidSignature(byte[] bytes, string header, string secret)
    {
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), bytes);
        Span<byte> provided = stackalloc byte[32];
        return header.Length == 71 && header.StartsWith("sha256=", StringComparison.Ordinal) &&
            Convert.FromHexString(header.AsSpan(7), provided, out _, out _) == System.Buffers.OperationStatus.Done &&
            CryptographicOperations.FixedTimeEquals(expected, provided);
    }

    private static bool IsMetaImage(string? value, out Uri? uri) =>
        Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == Uri.UriSchemeHttps &&
        uri.IsDefaultPort && uri.UserInfo.Length == 0 &&
        (uri.IdnHost.EndsWith(".fbcdn.net", StringComparison.OrdinalIgnoreCase) ||
         uri.IdnHost.EndsWith(".fbsbx.com", StringComparison.OrdinalIgnoreCase));

    private static string? GetImageMime(ReadOnlySpan<byte> bytes)
    {
        if (bytes.StartsWith((ReadOnlySpan<byte>)[137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
        if (bytes.StartsWith((ReadOnlySpan<byte>)[255, 216, 255])) return "image/jpeg";
        if (bytes.Length >= 12 && bytes.StartsWith("RIFF"u8) && bytes[8..].StartsWith("WEBP"u8)) return "image/webp";
        return null;
    }

    private static string? Field(JsonElement obj, string name) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;

    private static IEnumerable<JsonElement> Items(JsonElement obj, string name) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray() : [];
}
