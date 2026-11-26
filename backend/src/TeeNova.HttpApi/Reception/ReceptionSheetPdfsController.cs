using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Data.Common;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TeeNova.Auth;
using Volo.Abp.Threading;
using Volo.Abp.Uow;

namespace TeeNova.Reception;

[ApiController]
[Authorize(Roles = TeeNovaRoles.Admin)]
[Route("api/admin/reception-sheets/{id:guid}/pdfs")]
[UnitOfWork(IsDisabled = true)]
public class ReceptionSheetPdfsController(IReceptionSheetPdfArchive archive, IReceptionSheetPdfGenerator generator,
    IHostApplicationLifetime lifetime, TimeProvider clock, ICancellationTokenProvider cancellationTokens,
    ILogger<ReceptionSheetPdfsController> logger) : TeeNovaControllerBase
{
    private static readonly TimeSpan GenerationTimeout = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan ClaimLease = TimeSpan.FromMinutes(4);
    private const int MaxPdfBytes = 10 * 1024 * 1024;
    private static readonly SemaphoreSlim PreviewSlots = new(2);

    public sealed record GenerateInput([Required, StringLength(64)] string Version);

    [HttpPost]
    public async Task<IActionResult> Generate(Guid id, GenerateInput input, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        Guid? observedAttempt = null;
        while (true)
        {
            var reservation = await archive.ReserveAsync(id, input.Version, ReceptionSheetPdfSnapshot.TemplateVersion,
                observedAttempt, sheet => JsonSerializer.Serialize(ReceptionSheetPdfSnapshot.FromSheet(sheet)), ClaimLease, ct);
            switch (reservation)
            {
                case ReceptionSheetPdfReservation.MissingSheet:
                    return NotFound();
                case ReceptionSheetPdfReservation.StaleVersion:
                    return Conflict(new { message = "工单已更新，请重新打开并核对后再生成 PDF。" });
                case ReceptionSheetPdfReservation.Archived archived:
                    return Ok(archived.Info);
                case ReceptionSheetPdfReservation.Generate claim:
                    return await GenerateAndArchive(id, input.Version, claim);
                case ReceptionSheetPdfReservation.FailedAttempt:
                    return GenerationFailed(StatusCodes.Status502BadGateway);
                case ReceptionSheetPdfReservation.Pending pending:
                    observedAttempt = pending.Attempt;
                    await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
                    break;
            }
        }
    }

    [HttpGet]
    public async Task<IActionResult> List(Guid id, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        var files = await archive.ListAsync(id, ReceptionSheetPdfSnapshot.TemplateVersion, ct);
        return files is null ? NotFound() : Ok(files);
    }

    [HttpGet("{pdfId:guid}")]
    public async Task<IActionResult> Read(Guid id, Guid pdfId, [FromQuery] bool download, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        var content = await archive.ReadAsync(id, pdfId, ct);
        if (content is null) return NotFound();

        var fileName = $"reception-sheet-{id:N}-{pdfId:N}.pdf";
        Response.Headers.XContentTypeOptions = "nosniff";
        if (!download) Response.Headers.ContentDisposition = $"inline; filename=\"{fileName}\"";
        return File(content, "application/pdf", download ? fileName : null, enableRangeProcessing: true);
    }

    [HttpGet("{pdfId:guid}/pages/{page:int:min(1)}")]
    public async Task<IActionResult> ReadPage(Guid id, Guid pdfId, int page, [FromServices] IConfiguration config, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.XContentTypeOptions = "nosniff";
        await PreviewSlots.WaitAsync(ct);
        try
        {
            var pdf = await archive.ReadAsync(id, pdfId, ct, page);
            if (pdf is null) return NotFound();
            var renderer = config["GmailReception:PdfRenderer"] ?? "pdftocairo";
            var png = await PopplerPageRenderer.Png(pdf, page, 1800, renderer, ct);
            return File(png, "image/png");
        }
        catch (Exception ex) when (ex is Win32Exception or IOException or InvalidDataException ||
            ex is OperationCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning("Reception PDF page preview failed for archive entry {PdfId} ({ErrorType}).", pdfId, ex.GetType().Name);
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
        finally { PreviewSlots.Release(); }
    }

    private async Task<IActionResult> GenerateAndArchive(Guid sheetId, string version, ReceptionSheetPdfReservation.Generate claim)
    {
        // Once owned, finish the paid render even if the requester loses its connection.
        using var render = CancellationTokenSource.CreateLinkedTokenSource(lifetime.ApplicationStopping);
        render.CancelAfter(GenerationTimeout);
        using var databaseCancellation = cancellationTokens.Use(render.Token);
        try
        {
            var snapshot = JsonSerializer.Deserialize<ReceptionSheetPdfSnapshot>(claim.SnapshotJson)!;
            var pdf = await generator.GenerateAsync(snapshot, render.Token);
            if (pdf.Bytes.Length is 0 or > MaxPdfBytes || pdf.PageCount < 1)
            {
                await ReleaseClaim(claim);
                return GenerationFailed(StatusCodes.Status502BadGateway);
            }

            var now = clock.GetUtcNow();
            var archived = await archive.CompleteAsync(sheetId, version, claim.PdfId, claim.Attempt,
                pdf.PageCount, pdf.Bytes, now, render.Token);
            return archived is null ? NotFound() : Ok(archived);
        }
        catch (Exception ex) when (ex is ReceptionSheetPdfGenerationException or OperationCanceledException or JsonException)
        {
            logger.LogWarning("Reception PDF generation failed for archive entry {PdfId} ({ErrorType}).", claim.PdfId, ex.GetType().Name);
            await ReleaseClaim(claim);
            return GenerationFailed(StatusCodes.Status502BadGateway);
        }
        catch (Exception ex) when (ex is DbException or DbUpdateException)
        {
            logger.LogWarning("Reception PDF archival failed for archive entry {PdfId} ({ErrorType}).", claim.PdfId, ex.GetType().Name);
            await ReleaseClaim(claim);
            return GenerationFailed(StatusCodes.Status503ServiceUnavailable);
        }
    }

    private async Task ReleaseClaim(ReceptionSheetPdfReservation.Generate claim)
    {
        try
        {
            using var databaseCancellation = cancellationTokens.Use(CancellationToken.None);
            await archive.ReleaseAsync(claim.PdfId, claim.Attempt, CancellationToken.None);
        }
        catch (Exception ex) when (ex is DbException or DbUpdateException)
        {
            logger.LogWarning("Reception PDF release failed for archive entry {PdfId} ({ErrorType}); its lease will expire.",
                claim.PdfId, ex.GetType().Name);
        }
    }

    private ObjectResult GenerationFailed(int status) => StatusCode(status, new { message = "工单已保存，PDF 生成失败。请重试。" });
}
