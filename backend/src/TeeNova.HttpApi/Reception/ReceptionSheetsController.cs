using System.ComponentModel.DataAnnotations;
using Volo.Abp.Uow;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using System.Text.Json;
using TeeNova.AiOrderImports;
using TeeNova.AiOrderImports.Recognition;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TeeNova.Auth;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Data;

namespace TeeNova.Reception;

[ApiController]
[Route("api/admin/reception-sheets")]
[Authorize(Roles = TeeNovaRoles.Admin)]
public class ReceptionSheetsController(IRepository<ReceptionSheet, Guid> sheets,
    IRepository<AiOrderImport, Guid> imports, IRepository<AiOrderSourceDocument, Guid> documents,
    IConfiguration config, IHostEnvironment host, IOptions<PrivateObjectStorageOptions> storageOptions) : TeeNovaControllerBase
{
    public record InkPoint(double X, double Y);
    public record InkStroke(bool Erase, InkPoint[] Points);
    public record SheetInput([StringLength(160)] string? Customer, [StringLength(80)] string? Phone,
        DateOnly? PickupDate, [StringLength(ReceptionSheet.MaxInstructions)] string? Instructions, ReceptionPrintLayout? Layout = null,
        decimal? TotalPrice = null, decimal? Deposit = null, InkStroke[]? Handwriting = null, string? Version = null,
        ReceptionPhotoSource? SourcePhoto = null, bool ReplaceSourcePhoto = false,
        ReceptionTextSource? SourceText = null, bool ReplaceSourceText = false,
        [StringLength(ReceptionSheet.MaxPrintEstimateLength)] string? PrintEstimate = null,
        ReceptionMaterials? Materials = null, bool ReplaceMaterials = false, ReceptionPayment[]? Payments = null);
    public record SheetDto(Guid Id, string Customer, string Phone, DateOnly? PickupDate,
        string Instructions, string Stage, DateTime CreationTime, ReceptionPrintLayout? Layout, decimal? TotalPrice,
        decimal? Deposit, InkStroke[]? Handwriting, string Version, ReceptionPhotoSource? SourcePhoto, ReceptionTextSource? SourceText = null, string? PrintEstimate = null,
        MaterialDetails? Materials = null, ReceptionPayment[]? Payments = null);
    public record MaterialFile(Guid Id, string Name, string ContentType, int? PageCount, bool Expired, long ByteSize);
    public record MaterialDetails(Guid ImportId, Guid[] DocumentIds, string Description, MaterialFile[] Files);
    public record StageInput([Required] string Stage, string? Version = null, bool ManualAdjustment = false);
    private async Task<SheetDto> DescribeAsync(ReceptionSheet s, CancellationToken ct)
    {
        MaterialDetails? details = null;
        if (s.ReadMaterials() is { } batch)
        {
            var query = await documents.GetQueryableAsync();
            var files = await query.Where(d => d.ImportId == batch.ImportId && batch.DocumentIds.Contains(d.Id))
                .Select(d => new MaterialFile(d.Id, d.OriginalFileName ?? "原件", d.ContentType, d.PageCount, d.ContentDeletedAt != null, d.ByteSize))
                .ToDictionaryAsync(d => d.Id, ct);
            details = new(batch.ImportId, batch.DocumentIds, batch.Description, batch.DocumentIds.Select(id =>
                files.GetValueOrDefault(id) ?? new MaterialFile(id, "已过期的原件", "", null, true, 0)).ToArray());
        }
        return new(s.Id, s.Customer, s.Phone, s.PickupDate, s.Instructions, s.Stage.ToString(), s.CreationTime,
            s.ReadPrintLayout() is { } json ? JsonSerializer.Deserialize<ReceptionPrintLayout>(json) : null,
            s.TotalPrice, s.Deposit, s.HandwritingJson is { } ink ? JsonSerializer.Deserialize<InkStroke[]>(ink) : null,
            s.ConcurrencyStamp, s.ReadSourcePhoto(), s.ReadSourceText(), s.PrintEstimate, details,
            s.ReadPayments());
    }

    [HttpGet("recognition/{importId:guid}")]
    public async Task<IActionResult> RecognizedDraft(Guid importId,
        [FromServices] IRepository<AiOrderImportRevision, Guid> revisions, CancellationToken ct)
    {
        var query = await revisions.GetQueryableAsync();
        var json = await query.Where(r => r.ImportId == importId &&
                (r.ContractVersion == ReceptionRecognition.Contract || r.ContractVersion == ReceptionRecognition.BatchContract) &&
                r.Source == AiOrderRevisionSource.AI)
            .OrderByDescending(r => r.Revision).Select(r => r.CanonicalJson).FirstOrDefaultAsync(ct);
        return json == null ? NotFound() : Content(json, "application/json");
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ReceptionStage stage = ReceptionStage.Preparing,
        [FromQuery] DateOnly? pickupDate = null, [FromQuery] int offset = 0, [FromQuery, StringLength(160)] string? search = null,
        CancellationToken ct = default)
    {
        if (offset < 0 || !Enum.IsDefined(stage)) return BadRequest();
        var query = (await sheets.GetQueryableAsync()).AsNoTracking().Where(x => x.Stage == stage);
        if (pickupDate.HasValue) query = query.Where(x => x.PickupDate == pickupDate);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.Customer.Contains(term) || x.Phone.Contains(term) || x.Id.ToString().StartsWith(term));
        }
        var rows = await query.OrderBy(x => x.PickupDate == null).ThenBy(x => x.PickupDate)
            .ThenBy(x => x.CreationTime).ThenBy(x => x.Id).Skip(offset).Take(51)
            .Select(x => new { x.Id, x.Customer, x.Phone, x.PickupDate, x.CreationTime, x.TotalPrice, x.Deposit }).ToListAsync(ct);
        var page = rows.Take(50).ToArray();
        var artwork = page.Length == 0 ? null : GmailArtworkStore.Configured(config, host, storageOptions).ListForSheets(page.Select(s => s.Id));
        return Ok(new { items = page.Select(s => new { s.Id, s.Customer, s.Phone, s.PickupDate, s.CreationTime, s.TotalPrice, s.Deposit,
            artwork = artwork?[s.Id] ?? Enumerable.Empty<GmailFileInfo>() }), hasMore = rows.Count > 50 });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromQuery, Required, StringLength(64)] string version,
        [FromServices] IUnitOfWorkManager work, [FromServices] IReceptionSheetPdfArchive pdfs, CancellationToken ct)
    {
        using (var tx = work.Begin(requiresNew: true, isTransactional: true))
        {
            var sheet = await (await sheets.GetQueryableAsync()).IgnoreQueryFilters().SingleOrDefaultAsync(s => s.Id == id, ct);
            if (sheet == null) return NoContent();
            if (sheet.Stage != ReceptionStage.Deleted)
            {
                if (sheet.ConcurrencyStamp != version)
                    return Conflict(new { message = "工单已被更新，请重新打开并核对后再删除。" });
                sheet.MarkDeleted();
                await sheets.UpdateAsync(sheet, autoSave: true, cancellationToken: ct);
            }
            await pdfs.PurgeAsync(id, ct);
            await tx.CompleteAsync(ct);
        }
        GmailArtworkStore.Configured(config, host, storageOptions).ReturnFromDeletedSheet(id);
        return NoContent();
    }

    [HttpGet("{id:guid}")]
    public async Task<SheetDto> Get(Guid id, CancellationToken ct) =>
        await DescribeAsync(await sheets.GetAsync(id, cancellationToken: ct), ct);

    // Repeat submissions with identical content succeed even if the previous response was lost.
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Save(Guid id, SheetInput input, CancellationToken ct)
    {
        var strokes = input.Handwriting;
        if (strokes is { Length: > 10000 } || strokes?.Any(s => s?.Points is not { Length: > 0 } ||
            s.Points.Any(p => p == null || p.X is < 0 or > 1800 || p.Y is < 0 or > 3600)) == true ||
            strokes?.Sum(s => (long)s.Points.Length) > 150000)
            return BadRequest(new { message = "手稿超出支持范围。" });
        if (id == Guid.Empty || input.Layout?.IsValid() == false || !ReceptionSheet.ValidPayments(input.Payments) || !ReceptionSheet.ValidAmount(input.TotalPrice) ||
            !ReceptionSheet.ValidAmount(input.Deposit) || (input.Version == null && string.IsNullOrWhiteSpace(input.Customer) &&
            string.IsNullOrWhiteSpace(input.Phone) && input.PickupDate == null && string.IsNullOrWhiteSpace(input.Instructions) &&
            !(input.Layout?.Groups.Length > 0) && !(strokes?.Length > 0) && input.SourcePhoto == null && input.SourceText == null &&
            input.Materials == null && input.TotalPrice == null && input.Deposit == null && !(input.Payments?.Length > 0)))
            return BadRequest();
        var existing = await sheets.FindAsync(id, cancellationToken: ct);
        var previousMaterials = existing?.ReadMaterials();
        var materials = input.Materials ?? (input.ReplaceMaterials ? null : previousMaterials);
        var sameMaterials = materials?.SameInputs(previousMaterials) ?? previousMaterials == null;
        if (!sameMaterials && materials != null)
        {
            var batch = await imports.FindAsync(materials.ImportId, cancellationToken: ct);
            if (batch?.ContractVersion != ReceptionRecognition.BatchContract ||
                !materials.MatchesUpload(await (await documents.GetQueryableAsync()).AsNoTracking()
                    .Where(d => d.ImportId == materials.ImportId).OrderBy(d => d.Sequence).ToListAsync(ct)))
                return BadRequest(new { message = "材料或补充描述与本次上传不一致。请核对文件并重新提交。" });
        }
        var previousPhoto = existing?.ReadSourcePhoto();
        var photo = input.SourcePhoto ?? (input.ReplaceSourcePhoto || strokes is { Length: > 0 } ? null : previousPhoto);
        var previousText = existing?.ReadSourceText();
        var text = input.SourceText ?? (input.ReplaceSourceText ? null : previousText);
        if (photo != null && strokes is { Length: > 0 }) return BadRequest();
        if (photo != null && photo != previousPhoto &&
            await GetSourceContentType(photo.ImportId, photo.DocumentId, ct) is not ("image/jpeg" or "image/png"))
            return BadRequest(new { message = "无法关联这张接待照片，请重新选择原稿。" });
        if (text != null && text != previousText && await GetSourceContentType(text.ImportId, text.DocumentId, ct) != "text/plain")
            return BadRequest(new { message = "无法关联这份文字原稿，请重新提交原文。" });
        var layout = input.Layout == null ? null : JsonSerializer.Serialize(input.Layout);
        var ink = strokes is { Length: > 0 } ? JsonSerializer.Serialize(strokes) : null;
        var customer = input.Customer?.Trim() ?? "";
        var phone = input.Phone?.Trim() ?? "";
        var notes = input.Instructions?.Trim() ?? "";
        var estimate = input.PrintEstimate?.Trim();
        if (existing != null)
        {
            var previousLayout = existing.ReadPrintLayout();
            if (estimate == null && previousLayout == layout && existing.Instructions == notes)
                estimate = existing.PrintEstimate;
            if (estimate == "") estimate = null;
            if (existing.Customer == customer && existing.Phone == phone && existing.PickupDate == input.PickupDate &&
                existing.Instructions == notes && previousLayout == layout && existing.HandwritingJson == ink &&
                existing.TotalPrice == input.TotalPrice && existing.Deposit == input.Deposit && existing.PrintEstimate == estimate &&
                previousPhoto == photo && previousText == text && sameMaterials &&
                (input.Payments == null || existing.ReadPayments().SequenceEqual(input.Payments))) return Ok(await DescribeAsync(existing, ct));
            if (input.Version != existing.ConcurrencyStamp)
                return Conflict(new { message = "工单已在另一处更新。请重新载入后核对修改。" });
            existing.Revise(customer, phone, input.PickupDate, notes, layout, input.TotalPrice, input.Deposit, ink, estimate);
            existing.SetSourcePhoto(photo);
            existing.SetSourceText(text);
            existing.SetMaterials(materials);
            if (input.Payments != null) existing.SetPayments(input.Payments);
            await sheets.UpdateAsync(existing, autoSave: true, cancellationToken: ct);
            return Ok(await DescribeAsync(existing, ct));
        }
        if (input.Version != null) return NotFound();
        if (await (await sheets.GetQueryableAsync()).IgnoreQueryFilters().AnyAsync(s => s.Id == id && s.Stage == ReceptionStage.Deleted, ct))
            return Conflict(new { message = "这张工单已删除。" });
        var candidate = new ReceptionSheet(id, customer, phone, input.PickupDate, notes);
        candidate.Revise(customer, phone, input.PickupDate, notes, layout, input.TotalPrice, input.Deposit, ink, estimate);
        candidate.SetSourcePhoto(photo);
        candidate.SetSourceText(text);
        candidate.SetMaterials(materials);
        if (input.Payments != null) candidate.SetPayments(input.Payments);
        await sheets.InsertAsync(candidate, autoSave: true, cancellationToken: ct);
        return Ok(await DescribeAsync(candidate, ct));
    }

    private async Task<string?> GetSourceContentType(Guid importId, Guid documentId, CancellationToken ct)
    {
        var source = await documents.FindAsync(documentId, cancellationToken: ct);
        if (source == null || source.ImportId != importId || source.ContentDeletedAt.HasValue) return null;
        var import = await imports.FindAsync(importId, cancellationToken: ct);
        return import?.ContractVersion == ReceptionRecognition.Contract ? source.ContentType : null;
    }

    [HttpPut("{id:guid}/stage")]
    public async Task<IActionResult> Advance(Guid id, StageInput input, CancellationToken ct)
    {
        var sheet = await sheets.GetAsync(id, cancellationToken: ct);
        if (!Enum.TryParse<ReceptionStage>(input.Stage, out var next) || !Enum.IsDefined(next)) return BadRequest();
        if (input.ManualAdjustment && string.IsNullOrWhiteSpace(input.Version)) return BadRequest();
        if (input.Version != null && sheet.ConcurrencyStamp != input.Version)
            return Conflict(new { message = "工单已更新，请重新载入。" });
        if (!sheet.TryAdvance(next, input.ManualAdjustment)) return Conflict(new { message = "Refresh the queue to see this sheet’s current stage." });
        await sheets.UpdateAsync(sheet, autoSave: true, cancellationToken: ct);
        return Ok(await DescribeAsync(sheet, ct));
    }
}
