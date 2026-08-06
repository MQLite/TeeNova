using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using TeeNova.Enquiries.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Enquiries;

public interface IQuoteRequestAppService : IApplicationService
{
    Task<StageQuoteAttachmentResultDto> StageAttachmentAsync(IFormFile file, CancellationToken cancellationToken = default);
    Task<QuoteRequestResultDto> CreateAsync(CreateQuoteRequestDto input, string? clientIp, CancellationToken cancellationToken = default);
    Task<PagedResultDto<QuoteRequestSummaryDto>> GetListAsync(GetQuoteRequestsInput input, CancellationToken cancellationToken = default);
    Task<QuoteRequestDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<QuoteRequestDto> MarkReviewedAsync(Guid id, CancellationToken cancellationToken = default);
    Task<QuoteRequestDto> CancelAsync(Guid id, CancellationToken cancellationToken = default);
    Task<QuoteRequestDto> MarkSpamAsync(Guid id, CancellationToken cancellationToken = default);
    Task<QuoteRequestDto> ResendNotificationAsync(Guid id, ResendQuoteNotificationDto input, CancellationToken cancellationToken = default);
    Task<OpenedQuoteAttachment> OpenAttachmentAsync(Guid id, Guid attachmentId, CancellationToken cancellationToken = default);
}
