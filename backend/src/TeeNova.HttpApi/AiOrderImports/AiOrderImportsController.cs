using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.Recognition;
using TeeNova.AiOrderImports.Operations;
using TeeNova.AiOrderImports.Validation;
using TeeNova.Auth;

namespace TeeNova.AiOrderImports;

[ApiController]
[Route("api/admin/ai-order-imports")]
[Authorize(Roles = TeeNovaRoles.Admin)]
public sealed class AiOrderImportsController : TeeNovaControllerBase
{
    private const long MultipartRequestCeiling = 20L * 1024 * 1024;
    private readonly AiOrderImportIntakeAppService _appService;
    private readonly AiOrderRecognitionAppService _recognition;
    private readonly AiOrderReviewAppService _review;
    private readonly AiOrderConfirmationMaterializationService _confirmationMaterialization;
    private readonly AiOrderFeatureGate _features;
    private readonly AiOrderOperationsAppService _operations;
    private readonly AiOrderRetentionAppService _retention;

    public AiOrderImportsController(
        AiOrderImportIntakeAppService appService,
        AiOrderRecognitionAppService recognition,
        AiOrderReviewAppService review,
        AiOrderConfirmationMaterializationService confirmationMaterialization,
        AiOrderFeatureGate features,
        AiOrderOperationsAppService operations,
        AiOrderRetentionAppService retention)
    {
        _appService = appService;
        _recognition = recognition;
        _review = review;
        _confirmationMaterialization = confirmationMaterialization;
        _features = features;
        _operations = operations;
        _retention = retention;
    }

    [HttpPost]
    [EnableRateLimiting(AiOrderImportRateLimitPolicies.Create)]
    public Task<AiOrderImportDto> CreateAsync(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateAiOrderImportInput? input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireIntake, () =>
            _appService.CreateAsync(idempotencyKey ?? string.Empty, input, cancellationToken));

    [HttpGet]
    public Task<AiOrderImportListResultDto> GetListAsync(CancellationToken cancellationToken) =>
        _appService.GetListAsync(cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<AiOrderImportDto> GetAsync(
        Guid id,
        CancellationToken cancellationToken) =>
        _appService.GetAsync(id, cancellationToken);

    [HttpPost("{id:guid}/documents")]
    [EnableRateLimiting(AiOrderImportRateLimitPolicies.Upload)]
    [RequestSizeLimit(MultipartRequestCeiling)]
    [RequestFormLimits(MultipartBodyLengthLimit = MultipartRequestCeiling)]
    [Consumes("multipart/form-data")]
    public async Task<AiOrderSourceUploadResultDto> UploadAsync(
        Guid id,
        [FromHeader(Name = "Upload-Idempotency-Key")] string? uploadIdempotencyKey,
        [FromForm] IFormFile file,
        [FromForm] AiOrderCaptureMethod captureMethod = AiOrderCaptureMethod.Upload,
        CancellationToken cancellationToken = default)
    {
        _features.RequireIntake();
        await using var stream = file.OpenReadStream();
        return await _appService.UploadAsync(
            id,
            uploadIdempotencyKey ?? string.Empty,
            captureMethod,
            stream,
            file.FileName,
            file.ContentType,
            file.Length,
            cancellationToken);
    }

    [HttpGet("{id:guid}/documents/{documentId:guid}/content")]
    [EnableRateLimiting(AiOrderImportRateLimitPolicies.Content)]
    public async Task<IActionResult> GetContentAsync(
        Guid id,
        Guid documentId,
        CancellationToken cancellationToken)
    {
        var opened = await _appService.OpenSourceAsync(
            id,
            documentId,
            AiOrderSourceAccessType.InlineView,
            cancellationToken);

        Response.Headers[HeaderNames.CacheControl] = "no-store, private";
        Response.Headers[HeaderNames.Pragma] = "no-cache";
        Response.Headers[HeaderNames.XContentTypeOptions] = "nosniff";
        Response.Headers["Content-Security-Policy"] =
            "sandbox; default-src 'none'; frame-ancestors 'self'";
        Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
        Response.Headers[HeaderNames.ContentDisposition] =
            $"inline; filename=\"{opened.SafeFileName}\"";

        return new FileStreamResult(opened.Stream, opened.ContentType)
        {
            EnableRangeProcessing = false,
        };
    }

    [HttpPut("{id:guid}/documents/order")]
    public Task ReorderAsync(
        Guid id,
        [FromBody] ReorderAiOrderDocumentsInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireIntake, () => _appService.ReorderAsync(id, input, cancellationToken));

    [HttpPut("{id:guid}/documents/{documentId:guid}/rotation")]
    public Task SetRotationAsync(
        Guid id,
        Guid documentId,
        [FromBody] SetAiOrderDocumentRotationInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireIntake, () => _appService.SetRotationAsync(id, documentId, input, cancellationToken));

    [HttpDelete("{id:guid}/documents/{documentId:guid}")]
    public Task RemoveAsync(
        Guid id,
        Guid documentId,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireIntake, () => _appService.RemoveAsync(id, documentId, cancellationToken));

    [HttpPost("{id:guid}/cancel")]
    public Task CancelAsync(Guid id, CancellationToken cancellationToken) =>
        Gate(_features.RequireIntake, () => _appService.CancelAsync(id, cancellationToken));

    [HttpGet("recognition-options")]
    public Task<AiOrderRecognitionOptionsDto> GetRecognitionOptionsAsync() =>
        _recognition.GetOptionsAsync();

    [HttpPost("{id:guid}/recognition")]
    public Task<AiOrderRecognitionStatusDto> StartRecognitionAsync(
        Guid id,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] StartAiOrderRecognitionInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireRecognition, () => _recognition.StartAsync(
            id,
            idempotencyKey ?? string.Empty,
            input,
            cancellationToken));

    [HttpPost("{id:guid}/recognition/retry")]
    public Task<AiOrderRecognitionStatusDto> RetryRecognitionAsync(
        Guid id,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] StartAiOrderRecognitionInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireRecognition, () => _recognition.RetryAsync(
            id,
            idempotencyKey ?? string.Empty,
            input,
            cancellationToken));

    [HttpGet("{id:guid}/review")]
    public Task<AiOrderReviewDto> GetReviewAsync(
        Guid id,
        CancellationToken cancellationToken) =>
        _review.GetAsync(id, cancellationToken);

    [HttpPut("{id:guid}/review")]
    [RequestSizeLimit(1024 * 1024)]
    public Task<AiOrderReviewDto> SaveReviewAsync(
        Guid id,
        [FromBody] SaveAiOrderReviewInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireReview, () => _review.SaveAsync(id, input, cancellationToken));

    [HttpGet("{id:guid}/review/catalogue")]
    public Task<AiOrderCatalogueSearchResultDto> SearchReviewCatalogueAsync(
        Guid id,
        [FromQuery] string? query,
        CancellationToken cancellationToken) =>
        _review.SearchCatalogueAsync(id, query, cancellationToken);

    [HttpPost("{id:guid}/review/revalidate")]
    public Task<AiOrderReviewDto> RevalidateAsync(
        Guid id,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireReview, () => _review.RevalidateAsync(id, cancellationToken));

    [HttpPost("{id:guid}/confirm")]
    public Task<AiOrderImportConfirmationDto> ConfirmAsync(
        Guid id,
        [FromBody] ConfirmAiOrderImportInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireConfirmation, () =>
            _confirmationMaterialization.ConfirmAsync(id, input, cancellationToken));

    [HttpGet("{id:guid}/materialization-preflight")]
    public Task<AiOrderMaterializationPreflightDto> GetMaterializationPreflightAsync(
        Guid id,
        CancellationToken cancellationToken) =>
        _confirmationMaterialization.GetPreflightAsync(id, cancellationToken);

    [HttpPost("{id:guid}/materialize")]
    [RequestSizeLimit(1024 * 1024)]
    public Task<AiOrderMaterializationResultDto> MaterializeAsync(
        Guid id,
        [FromBody] MaterializeAiOrderImportInput input,
        CancellationToken cancellationToken) =>
        Gate(_features.RequireMaterialization, () =>
            _confirmationMaterialization.MaterializeAsync(id, input, cancellationToken));

    [HttpGet("operations/status")]
    public Task<AiOrderOperationsStatusDto> GetOperationsStatusAsync(
        CancellationToken cancellationToken) =>
        _operations.GetStatusAsync(cancellationToken);

    [HttpGet("{id:guid}/retention")]
    public Task<AiOrderRetentionSummaryDto> GetRetentionAsync(
        Guid id,
        CancellationToken cancellationToken) =>
        _retention.GetSummaryAsync(id, cancellationToken);

    [HttpPost("{id:guid}/retention-hold")]
    public Task<AiOrderRetentionSummaryDto> PlaceRetentionHoldAsync(
        Guid id,
        [FromBody] PlaceAiOrderRetentionHoldInput input,
        CancellationToken cancellationToken) =>
        _retention.PlaceHoldAsync(id, input, cancellationToken);

    [HttpDelete("{id:guid}/retention-hold")]
    public Task<AiOrderRetentionSummaryDto> ReleaseRetentionHoldAsync(
        Guid id,
        [FromBody] ReleaseAiOrderRetentionHoldInput input,
        CancellationToken cancellationToken) =>
        _retention.ReleaseHoldAsync(id, input, cancellationToken);

    [HttpPost("{id:guid}/retention/extend")]
    public Task<AiOrderRetentionSummaryDto> ExtendRetentionAsync(
        Guid id,
        [FromBody] ExtendAiOrderRetentionInput input,
        CancellationToken cancellationToken) =>
        _retention.ExtendAsync(id, input, cancellationToken);

    [HttpPost("{id:guid}/retention/delete-source")]
    public Task DeleteRetainedSourceAsync(
        Guid id,
        [FromBody] DeleteAiOrderRetainedBytesInput input,
        CancellationToken cancellationToken) =>
        _retention.DeleteSourceAsync(id, input, cancellationToken);

    [HttpPost("{id:guid}/retention/delete-raw-evidence")]
    public Task DeleteRetainedRawEvidenceAsync(
        Guid id,
        [FromBody] DeleteAiOrderRetainedBytesInput input,
        CancellationToken cancellationToken) =>
        _retention.DeleteRawEvidenceAsync(id, input, cancellationToken);

    private static Task<T> Gate<T>(Action require, Func<Task<T>> action)
    {
        require();
        return action();
    }

    private static Task Gate(Action require, Func<Task> action)
    {
        require();
        return action();
    }
}
