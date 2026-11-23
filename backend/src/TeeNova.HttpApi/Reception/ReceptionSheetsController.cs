using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using TeeNova.AiOrderImports;
using TeeNova.AiOrderImports.Recognition;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeeNova.Auth;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Reception;

[ApiController]
[Route("api/admin/reception-sheets")]
[Authorize(Roles = TeeNovaRoles.Admin)]
public class ReceptionSheetsController(IRepository<ReceptionSheet, Guid> sheets,
    IRepository<AiOrderImport, Guid> imports, IRepository<AiOrderSourceDocument, Guid> documents) : TeeNovaControllerBase
{
    public record InkPoint(double X, double Y);
    public record InkStroke(bool Erase, InkPoint[] Points);
    public record SheetInput([StringLength(160)] string? Customer, [StringLength(80)] string? Phone,
        DateOnly? PickupDate, [StringLength(ReceptionSheet.MaxInstructions)] string? Instructions, ReceptionPrintLayout? Layout = null,
        decimal? TotalPrice = null, decimal? Deposit = null, InkStroke[]? Handwriting = null, string? Version = null,
        ReceptionPhotoSource? SourcePhoto = null, bool ReplaceSourcePhoto = false);
    public record SheetDto(Guid Id, string Customer, string Phone, DateOnly? PickupDate,
        string Instructions, string Stage, DateTime CreationTime, ReceptionPrintLayout? Layout, decimal? TotalPrice,
        decimal? Deposit, InkStroke[]? Handwriting, string Version, ReceptionPhotoSource? SourcePhoto);
    public record StageInput([Required] string Stage, string? Version = null);
    private static SheetDto Describe(ReceptionSheet s) =>
        new(s.Id, s.Customer, s.Phone, s.PickupDate, s.Instructions, s.Stage.ToString(), s.CreationTime,
            s.ReadPrintLayout() is { } json ? JsonSerializer.Deserialize<ReceptionPrintLayout>(json) : null,
            s.TotalPrice, s.Deposit, s.HandwritingJson is { } ink ? JsonSerializer.Deserialize<InkStroke[]>(ink) : null,
            s.ConcurrencyStamp, s.ReadSourcePhoto());

    [HttpGet("recognition/{importId:guid}")]
    public async Task<IActionResult> RecognizedDraft(Guid importId,
        [FromServices] IRepository<AiOrderImportRevision, Guid> revisions, CancellationToken ct)
    {
        var query = await revisions.GetQueryableAsync();
        var json = await query.Where(r => r.ImportId == importId && r.ContractVersion == ReceptionRecognition.Contract &&
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
            .Select(x => new { x.Id, x.Customer, x.PickupDate, x.CreationTime, x.TotalPrice, x.Deposit }).ToListAsync(ct);
        return Ok(new { items = rows.Take(50), hasMore = rows.Count > 50 });
    }

    [HttpGet("{id:guid}")]
    public async Task<SheetDto> Get(Guid id, CancellationToken ct) =>
        Describe(await sheets.GetAsync(id, cancellationToken: ct));

    // Repeat submissions with identical content succeed even if the previous response was lost.
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Save(Guid id, SheetInput input, CancellationToken ct)
    {
        var strokes = input.Handwriting;
        if (strokes is { Length: > 10000 } || strokes?.Any(s => s?.Points is not { Length: > 0 } ||
            s.Points.Any(p => p == null || p.X is < 0 or > 1800 || p.Y is < 0 or > 900)) == true ||
            strokes?.Sum(s => (long)s.Points.Length) > 150000)
            return BadRequest(new { message = "手稿超出支持范围。" });
        if (id == Guid.Empty || input.Layout?.IsValid() == false || !ReceptionSheet.ValidAmount(input.TotalPrice) ||
            !ReceptionSheet.ValidAmount(input.Deposit) || (input.Version == null && string.IsNullOrWhiteSpace(input.Customer) &&
            string.IsNullOrWhiteSpace(input.Phone) && input.PickupDate == null && string.IsNullOrWhiteSpace(input.Instructions) &&
            !(input.Layout?.Groups.Length > 0) && !(strokes?.Length > 0) && input.SourcePhoto == null &&
            input.TotalPrice == null && input.Deposit == null))
            return BadRequest();
        var existing = await sheets.FindAsync(id, cancellationToken: ct);
        var previousPhoto = existing?.ReadSourcePhoto();
        var photo = input.SourcePhoto ?? (input.ReplaceSourcePhoto || strokes is { Length: > 0 } ? null : previousPhoto);
        if (photo != null && strokes is { Length: > 0 }) return BadRequest();
        if (photo != null && photo != previousPhoto)
        {
            var source = await documents.FindAsync(photo.DocumentId, cancellationToken: ct);
            if (source == null || source.ImportId != photo.ImportId || source.ContentDeletedAt.HasValue ||
                source.ContentType is not ("image/jpeg" or "image/png") ||
                (await imports.FindAsync(photo.ImportId, cancellationToken: ct))?.ContractVersion != ReceptionRecognition.Contract)
                return BadRequest(new { message = "无法关联这张接待照片，请重新选择原稿。" });
        }
        var layout = input.Layout == null ? null : JsonSerializer.Serialize(input.Layout);
        var ink = strokes is { Length: > 0 } ? JsonSerializer.Serialize(strokes) : null;
        var customer = input.Customer?.Trim() ?? "";
        var phone = input.Phone?.Trim() ?? "";
        var notes = input.Instructions?.Trim() ?? "";
        if (existing != null)
        {
            if (existing.Customer == customer && existing.Phone == phone && existing.PickupDate == input.PickupDate &&
                existing.Instructions == notes && existing.ReadPrintLayout() == layout && existing.HandwritingJson == ink &&
                existing.TotalPrice == input.TotalPrice && existing.Deposit == input.Deposit && previousPhoto == photo) return Ok(Describe(existing));
            if (input.Version != existing.ConcurrencyStamp)
                return Conflict(new { message = "工单已在另一处更新。请重新载入后核对修改。" });
            existing.Revise(customer, phone, input.PickupDate, notes, layout, input.TotalPrice, input.Deposit, ink);
            existing.SetSourcePhoto(photo);
            await sheets.UpdateAsync(existing, autoSave: true, cancellationToken: ct);
            return Ok(Describe(existing));
        }
        if (input.Version != null) return NotFound();
        var candidate = new ReceptionSheet(id, customer, phone, input.PickupDate, notes);
        candidate.Revise(customer, phone, input.PickupDate, notes, layout, input.TotalPrice, input.Deposit, ink);
        candidate.SetSourcePhoto(photo);
        await sheets.InsertAsync(candidate, autoSave: true, cancellationToken: ct);
        return Ok(Describe(candidate));
    }

    [HttpPut("{id:guid}/stage")]
    public async Task<IActionResult> Advance(Guid id, StageInput input, CancellationToken ct)
    {
        var sheet = await sheets.GetAsync(id, cancellationToken: ct);
        if (!Enum.TryParse<ReceptionStage>(input.Stage, out var next) || !Enum.IsDefined(next)) return BadRequest();
        if (input.Version != null && sheet.ConcurrencyStamp != input.Version)
            return Conflict(new { message = "工单已更新，请重新载入。" });
        if (!sheet.TryAdvance(next)) return Conflict(new { message = "Refresh the queue to see this sheet’s current stage." });
        await sheets.UpdateAsync(sheet, autoSave: true, cancellationToken: ct);
        return Ok(Describe(sheet));
    }
}
