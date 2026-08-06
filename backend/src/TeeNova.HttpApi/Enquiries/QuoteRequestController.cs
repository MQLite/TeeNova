using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;
using TeeNova.Auth;
using TeeNova.Enquiries.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Enquiries;

[ApiController]
[Route("api/quote-requests")]
[Authorize(Roles = $"{TeeNovaRoles.Admin},{TeeNovaRoles.Viewer}")]
public sealed class QuoteRequestController : TeeNovaControllerBase
{
    private const long UploadRequestLimit = 20L * 1024 * 1024 + 64 * 1024;
    private readonly IQuoteRequestAppService _appService;
    public QuoteRequestController(IQuoteRequestAppService appService) => _appService = appService;

    [HttpPost("attachments")]
    [AllowAnonymous]
    [EnableRateLimiting("PublicQuoteUploadPolicy")]
    [RequestSizeLimit(UploadRequestLimit)]
    [RequestFormLimits(MultipartBodyLengthLimit = UploadRequestLimit)]
    [Consumes("multipart/form-data")]
    public Task<StageQuoteAttachmentResultDto> StageAttachmentAsync(
        [FromForm] IFormFile file, CancellationToken cancellationToken)
        => _appService.StageAttachmentAsync(file, cancellationToken);

    [HttpPost]
    [AllowAnonymous]
    [EnableRateLimiting("PublicQuotePolicy")]
    [RequestSizeLimit(256 * 1024)]
    public Task<QuoteRequestResultDto> CreateAsync(
        [FromBody] CreateQuoteRequestDto input, CancellationToken cancellationToken)
        => _appService.CreateAsync(input, HttpContext.Connection.RemoteIpAddress?.ToString(), cancellationToken);

    [HttpGet]
    public Task<PagedResultDto<QuoteRequestSummaryDto>> GetListAsync(
        [FromQuery] GetQuoteRequestsInput input, CancellationToken cancellationToken)
        => _appService.GetListAsync(input, cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<QuoteRequestDto> GetAsync(Guid id, CancellationToken cancellationToken)
        => _appService.GetAsync(id, cancellationToken);

    [HttpPost("{id:guid}/mark-reviewed")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<QuoteRequestDto> MarkReviewedAsync(Guid id, CancellationToken cancellationToken)
        => _appService.MarkReviewedAsync(id, cancellationToken);

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<QuoteRequestDto> CancelAsync(Guid id, CancellationToken cancellationToken)
        => _appService.CancelAsync(id, cancellationToken);

    [HttpPost("{id:guid}/mark-spam")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<QuoteRequestDto> MarkSpamAsync(Guid id, CancellationToken cancellationToken)
        => _appService.MarkSpamAsync(id, cancellationToken);

    [HttpPost("{id:guid}/resend-notification")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<QuoteRequestDto> ResendNotificationAsync(
        Guid id, [FromBody] ResendQuoteNotificationDto input, CancellationToken cancellationToken)
        => _appService.ResendNotificationAsync(id, input, cancellationToken);

    [HttpGet("{id:guid}/attachments/{attachmentId:guid}/content")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<IActionResult> GetAttachmentContentAsync(
        Guid id, Guid attachmentId, CancellationToken cancellationToken)
    {
        var opened = await _appService.OpenAttachmentAsync(id, attachmentId, cancellationToken);
        Response.Headers[HeaderNames.CacheControl] = "no-store, private";
        Response.Headers[HeaderNames.Pragma] = "no-cache";
        Response.Headers[HeaderNames.XContentTypeOptions] = "nosniff";
        Response.Headers[HeaderNames.ContentDisposition] = $"attachment; filename=\"{opened.SafeFileName}\"";
        Response.Headers["Content-Security-Policy"] = "sandbox; default-src 'none'; frame-ancestors 'none'";
        Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
        return new FileStreamResult(opened.Stream, opened.ContentType) { EnableRangeProcessing = false };
    }
}
