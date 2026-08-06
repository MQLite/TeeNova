using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using TeeNova.Enquiries.Dtos;
using TeeNova.Enquiries.PrivateStorage;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Enquiries;

public interface IQuoteAttachmentService
{
    Task<StageQuoteAttachmentResultDto> StageAsync(IFormFile file, CancellationToken cancellationToken = default);
}

public sealed class QuoteAttachmentService : IQuoteAttachmentService, ITransientDependency
{
    private static readonly IReadOnlyDictionary<string, string[]> ContentTypes =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            [".png"] = ["image/png"],
            [".jpg"] = ["image/jpeg"],
            [".jpeg"] = ["image/jpeg"],
            [".webp"] = ["image/webp"],
            [".pdf"] = ["application/pdf"],
            [".ai"] = ["application/pdf", "application/postscript", "application/illustrator", "application/octet-stream"],
        };

    private readonly IRepository<QuoteRequestAttachment, Guid> _repository;
    private readonly IQuotePrivateObjectStorage _storage;
    private readonly QuoteRequestOptions _options;

    public QuoteAttachmentService(
        IRepository<QuoteRequestAttachment, Guid> repository,
        IQuotePrivateObjectStorage storage,
        IOptions<QuoteRequestOptions> options)
    {
        _repository = repository;
        _storage = storage;
        _options = options.Value;
    }

    public async Task<StageQuoteAttachmentResultDto> StageAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        RequireEnabled();
        if (file is null) Invalid("Select a non-empty file.");
        if (file!.Length <= 0) Invalid("Select a non-empty file.");
        if (file.Length > _options.MaxAttachmentBytes) Invalid("The attachment is too large.");

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowedExtensions = new HashSet<string>(_options.AllowedExtensions ?? [], StringComparer.OrdinalIgnoreCase);
        if (!allowedExtensions.Contains(extension))
            Invalid("Only PNG, JPEG, WebP, PDF and AI files are accepted.");
        if (!ContentTypes.TryGetValue(extension, out var allowedTypes))
            Invalid("Only PNG, JPEG, WebP, PDF and AI files are accepted.");
        var contentType = (file.ContentType ?? string.Empty).Trim().ToLowerInvariant();
        if (!allowedTypes!.Contains(contentType, StringComparer.OrdinalIgnoreCase))
            Invalid("The file content type does not match its extension.");

        await using var input = file.OpenReadStream();
        await using var buffer = new MemoryStream((int)Math.Min(file.Length, _options.MaxAttachmentBytes));
        await input.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length != file.Length || buffer.Length > _options.MaxAttachmentBytes)
            Invalid("The uploaded file length is invalid.");
        var bytes = buffer.ToArray();
        if (!SignatureMatches(extension, bytes)) Invalid("The file signature does not match its extension.");

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var tokenHash = Sha256(token);
        var objectKey = string.Empty;
        try
        {
            buffer.Position = 0;
            objectKey = await _storage.SaveAsync(buffer, cancellationToken);
            var attachment = new QuoteRequestAttachment(Guid.NewGuid())
            {
                ObjectKey = objectKey,
                OriginalFileName = SanitizeFileName(file.FileName),
                ContentType = contentType,
                SizeBytes = buffer.Length,
                Sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                UploadTokenHash = tokenHash,
                StagedUntil = DateTime.UtcNow.AddMinutes(Math.Max(1, _options.AttachmentStagingMinutes)),
                ScanStatus = QuoteAttachmentScanStatus.NotScanned,
            };
            await _repository.InsertAsync(attachment, autoSave: true, cancellationToken: cancellationToken);
            return new StageQuoteAttachmentResultDto
            {
                AttachmentToken = token,
                FileName = attachment.OriginalFileName,
                ContentType = contentType,
                SizeBytes = attachment.SizeBytes,
            };
        }
        catch
        {
            if (!string.IsNullOrEmpty(objectKey)) try { await _storage.DeleteAsync(objectKey, CancellationToken.None); } catch { }
            throw;
        }
    }

    internal static bool SignatureMatches(string extension, ReadOnlySpan<byte> bytes)
    {
        return extension switch
        {
            ".png" => bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            ".jpg" or ".jpeg" => bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff,
            ".webp" => bytes.Length >= 12 && Encoding.ASCII.GetString(bytes[..4]) == "RIFF" && Encoding.ASCII.GetString(bytes.Slice(8, 4)) == "WEBP",
            ".pdf" => bytes.Length >= 5 && Encoding.ASCII.GetString(bytes[..5]) == "%PDF-",
            ".ai" => (bytes.Length >= 5 && Encoding.ASCII.GetString(bytes[..5]) == "%PDF-") ||
                     (bytes.Length >= 4 && Encoding.ASCII.GetString(bytes[..4]) == "%!PS"),
            _ => false,
        };
    }

    internal static string Sha256(string value)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string SanitizeFileName(string value)
    {
        var fileName = Path.GetFileName(value ?? string.Empty);
        var safe = new string(fileName.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (string.IsNullOrEmpty(safe)) safe = "artwork";
        return safe.Length <= 260 ? safe : safe[..260];
    }

    private void RequireEnabled()
    {
        if (!_options.Enabled || _options.RetentionDays is null or <= 0)
            throw new BusinessException(QuoteRequestErrorCodes.Disabled, "Quote requests are not enabled.");
    }

    private static void Invalid(string message) => throw new BusinessException(QuoteRequestErrorCodes.AttachmentInvalid, message);
}
