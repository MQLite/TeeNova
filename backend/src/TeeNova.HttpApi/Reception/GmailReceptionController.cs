using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.Auth;
using Volo.Abp.Auditing;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;
using Volo.Abp.Data;

namespace TeeNova.Reception;

[ApiController, DisableAuditing]
[Route("api/gmail-reception")]
public sealed class GmailReceptionController(IRepository<ReceptionSheet, Guid> sheets, IConfiguration config,
    IHostEnvironment environment, IOptions<PrivateObjectStorageOptions> storageOptions) : TeeNovaControllerBase
{
    private const int MaxBytes = ManualArtworkUpload.MaxBytes;
    private GmailArtworkStore Store => GmailArtworkStore.Configured(config, environment, storageOptions);

    [HttpGet("sheets"), Authorize(Policy = "GmailReception")]
    public Task<IActionResult> Search([FromQuery, Required, StringLength(160, MinimumLength = 2)] string search, CancellationToken ct) => SearchSheets(search, ct);

    [HttpGet("pending/sheets"), Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<IActionResult> SearchForPending([FromQuery, Required, StringLength(160, MinimumLength = 2)] string search, CancellationToken ct) => SearchSheets(search, ct);

    private async Task<IActionResult> SearchSheets(string search, CancellationToken ct)
    {
        var term = search.Trim().TrimStart('#');
        if (term.Length < 2) return BadRequest();
        var query = await sheets.GetQueryableAsync();
        var matches = await query.AsNoTracking().Where(s => s.Customer.Contains(term) || s.Phone.Contains(term)
            || s.Id.ToString().StartsWith(term)).OrderByDescending(s => s.CreationTime).ThenBy(s => s.Id)
            .Select(s => new { s.Id, s.Customer, s.PickupDate, s.Phone }).Take(11).ToListAsync(ct);
        return Ok(new { more = matches.Count > 10, items = matches.Take(10).Select(s => new {
            s.Id, s.Customer, s.PickupDate, phoneEnd = s.Phone.Length > 4 ? s.Phone[^4..] : s.Phone
        }) });
    }

    [HttpPost("sheets/{id:guid}/attachments"), Authorize(Policy = "GmailReception")]
    [RequestSizeLimit(MaxBytes + 65536)]
    public Task<IActionResult> Associate(Guid id, CancellationToken ct) =>
        id == Guid.Empty ? Task.FromResult<IActionResult>(BadRequest()) : Receive(id, ct);

    [HttpPost("pending"), Authorize(Policy = "GmailReception"), RequestSizeLimit(MaxBytes + 65536)]
    public Task<IActionResult> ReceivePending(CancellationToken ct) => Receive(Guid.Empty, ct);

    [HttpPost("pending/upload"), Authorize(Roles = TeeNovaRoles.Admin), RequestSizeLimit(MaxBytes + 65536)]
    public Task<IActionResult> UploadPending(CancellationToken ct) => Upload(Guid.Empty, ct);

    [HttpPost("sheets/{id:guid}/attachments/upload"), Authorize(Roles = TeeNovaRoles.Admin), RequestSizeLimit(MaxBytes + 65536)]
    public async Task<IActionResult> UploadToSheet(Guid id, CancellationToken ct)
    {
        if (id == Guid.Empty || await sheets.FindAsync(id, cancellationToken: ct) == null)
            return NotFound(new { message = "找不到这张工单，请刷新后重试。" });
        return await Upload(id, ct);
    }

    private async Task<IActionResult> Upload(Guid sheet, CancellationToken ct)
    {
        if (!Request.HasFormContentType) return BadRequest(new { message = "请选择要上传的文件。" });
        IFormCollection form;
        try { form = await Request.ReadFormAsync(ct); }
        catch (InvalidDataException) { return BadRequest(new { message = "上传数据不完整或过大，请重新选择文件。" }); }
        catch (BadHttpRequestException e) when (e.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return StatusCode(e.StatusCode, new { message = "每次上传的文件合计不能超过 8 MiB。" });
        }
        ManualArtworkUpload upload;
        try { upload = await ManualArtworkUpload.Read(form, ct); }
        catch (InvalidDataException e) { return BadRequest(new { message = e.Message }); }

        var result = Store.SaveUpload(sheet, upload.Id, upload.Files);
        if (result.Conflict) return Conflict(new { message = "工单或上传内容已改变，请刷新后重新选择文件。" });
        return Ok(new { result.SheetId, result.Added, count = upload.Files.Count });
    }

    private async Task<IActionResult> Receive(Guid id, CancellationToken ct)
    {
        if (!Request.HasFormContentType) return BadRequest();
        var form = await Request.ReadFormAsync(ct);
        var message = form["messageId"].ToString();
        if (!Regex.IsMatch(message, @"\A[0-9a-fA-F]{1,32}\z") || form.Files.Count is 0 or > 10 ||
            form.Files.Sum(f => f.Length) > MaxBytes) return BadRequest();
        GmailOrigin? origin = null;
        if (id == Guid.Empty)
        {
            var sender = form["sender"].ToString();
            var subject = form["subject"].ToString();
            if (sender.Length is 0 or > 1000 || subject.Length > 2000 ||
                !DateTimeOffset.TryParse(form["received"].ToString(), out var received)) return BadRequest();
            origin = new(sender, subject, received);
        }
        else if (await sheets.FindAsync(id, cancellationToken: ct) == null) return NotFound();
        var files = new List<GmailFile>();
        foreach (var upload in form.Files)
        {
            var match = Regex.Match(upload.Name, @"\Afile(0|[1-9][0-9]{0,3})\z");
            if (!match.Success || upload.Length == 0) return BadRequest();
            var slot = int.Parse(match.Groups[1].Value);
            var name = Path.GetFileName(upload.FileName.Replace('\\', '/')).Trim();
            if (files.Any(f => f.Slot == slot) || name.Length is 0 or > 200 || name.Any(char.IsControl)) return BadRequest();
            using var buffer = new MemoryStream();
            await upload.CopyToAsync(buffer, ct);
            var content = buffer.ToArray();
            var mime = DetectType(content);
            if (mime == null) return BadRequest(new { message = "请选择 PDF、PNG 或 JPEG 附件。" });
            files.Add(new(slot, name, mime, content));
        }
        var result = Store.Save(id, config["GmailReception:Mailbox"]!.ToLowerInvariant(), message.ToLowerInvariant(), files, origin);
        if (result.Conflict) return Conflict(new { result.SheetId, message = result.SheetId == Guid.Empty
            ? "附件已在待关联设计稿中，请从接待工作台选择工单。"
            : $"附件已关联工单 #{result.SheetId.ToString()[..8]}，本次选择未保存。" });
        return Ok(new { result.SheetId, result.Added, count = files.Count });
    }

    [HttpGet("pending"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> Pending(CancellationToken ct)
    {
        var store = Store;
        await RecoverReturns(store, ct);
        return Ok(store.Pending());
    }

    [HttpGet("pending/notice"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> PendingNotice(CancellationToken ct)
    {
        var store = Store;
        await RecoverReturns(store, ct);
        var (count, latest) = store.PendingNotice();
        return Ok(new { count, latest });
    }

    public record NewOrder([Required, StringLength(160)] string Customer);

    private async Task RecoverReturns(GmailArtworkStore store, CancellationToken ct)
    {
        var sheetsQuery = (await sheets.GetQueryableAsync()).AsNoTracking().IgnoreQueryFilters();
        foreach (var batch in store.LinkedSheets().Chunk(500))
        {
            var deleted = await sheetsQuery.Where(s => s.Stage == ReceptionStage.Deleted && batch.Contains(s.Id))
                .Select(s => s.Id).ToListAsync(ct);
            foreach (var id in deleted) store.ReturnFromDeletedSheet(id);
        }
    }

    [HttpDelete("pending/{file:guid}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public IActionResult RemovePending(Guid file) => RemoveArtwork(Guid.Empty, file);

    [HttpDelete("sheets/{id:guid}/attachments/{file:guid}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> RemoveLinked(Guid id, Guid file, CancellationToken ct)
    {
        if (id == Guid.Empty || await sheets.FindAsync(id, cancellationToken: ct) == null) return NotFound();
        return RemoveArtwork(id, file);
    }

    private IActionResult RemoveArtwork(Guid sheet, Guid file) => Store.Remove(sheet, file) ? NoContent() :
        Conflict(new { message = "稿件状态已改变，请刷新后核对。" });

    [HttpPost("pending/{file:guid}/create"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> CreateFromArtwork(Guid file, NewOrder input, [FromServices] IUnitOfWorkManager work, CancellationToken ct)
    {
        var name = Store.ReserveNew(file, input.Customer.Trim());
        if (name == null) return Conflict(new { message = "这份稿已被处理，请刷新列表。" });
        using (var tx = work.Begin(requiresNew: true, isTransactional: true))
        {
            var sheet = await sheets.FindAsync(file, cancellationToken: ct);
            if (sheet == null)
            {
                if (await (await sheets.GetQueryableAsync()).IgnoreQueryFilters().AnyAsync(s => s.Id == file && s.Stage == ReceptionStage.Deleted, ct))
                    return Conflict(new { message = "关联工单已删除。" });
                sheet = new ReceptionSheet(file, name, "", null, "");
                sheet.SetProperty("GmailPendingArtworkId", file.ToString());
                await sheets.InsertAsync(sheet, cancellationToken: ct);
            }
            else if (sheet.GetProperty<string>("GmailPendingArtworkId") != file.ToString()) return Conflict();
            await tx.CompleteAsync(ct);
        }
        return Store.Assign(file, file, creating: true) ? Ok(new { sheetId = file }) : Conflict();
    }

    [HttpPost("pending/{file:guid}/link/{sheet:guid}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> LinkPending(Guid file, Guid sheet, CancellationToken ct)
    {
        if (sheet == Guid.Empty || await sheets.FindAsync(sheet, cancellationToken: ct) == null) return NotFound();
        return Store.Assign(file, sheet, creating: false) ? Ok(new { sheetId = sheet }) :
            Conflict(new { message = "这份稿已关联或正在开单，请刷新列表。" });
    }

    private static string? DetectType(ReadOnlySpan<byte> bytes)
    {
        if (bytes.StartsWith("%PDF-"u8)) return "application/pdf";
        if (bytes.StartsWith((ReadOnlySpan<byte>)[137,80,78,71,13,10,26,10])) return "image/png";
        if (bytes.StartsWith((ReadOnlySpan<byte>)[255,216,255])) return "image/jpeg";
        return null;
    }

    [HttpGet("sheets/{id:guid}/attachments"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> List(Guid id, CancellationToken ct)
    {
        if (await sheets.FindAsync(id, cancellationToken: ct) == null) return NotFound();
        return Ok(Store.List(id));
    }

    [HttpGet("sheets/{id:guid}/attachments/{fileId:guid}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> Content(Guid id, Guid fileId, CancellationToken ct)
    {
        if (await sheets.FindAsync(id, cancellationToken: ct) == null || Store.Read(id, fileId) is not { } file) return NotFound();
        return PrivateFile(file.Bytes, file.Mime);
    }

    [HttpGet("pending/{fileId:guid}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public IActionResult PendingContent(Guid fileId) => Store.Read(Guid.Empty, fileId) is { } file
        ? PrivateFile(file.Bytes, file.Mime) : NotFound();

    [HttpGet("pending/{fileId:guid}/{variant:regex(^(thumbnail|preview)$)}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<IActionResult> PendingPreview(Guid fileId, string variant, CancellationToken ct) =>
        Preview(Guid.Empty, fileId, variant, ct);

    [HttpGet("sheets/{id:guid}/attachments/{fileId:guid}/{variant:regex(^(thumbnail|preview)$)}"), Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> SheetPreview(Guid id, Guid fileId, string variant, CancellationToken ct)
    {
        if (id == Guid.Empty || await sheets.FindAsync(id, cancellationToken: ct) == null) return NotFound();
        return await Preview(id, fileId, variant, ct);
    }

    private async Task<IActionResult> Preview(Guid sheet, Guid file, string variant, CancellationToken ct)
    {
        var data = await GmailArtworkPreview.Get(Store, sheet, file, variant == "thumbnail" ? 320 : 1440,
            config["GmailReception:PdfRenderer"] ?? "pdftocairo", ct);
        return data == null ? NotFound() : PrivateFile(data, "image/png");
    }

    private FileContentResult PrivateFile(byte[] bytes, string mime)
    {
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'";
        return File(bytes, mime);
    }
}

