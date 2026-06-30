using System;
using System.Threading.Tasks;
using TeeNova.Enquiries.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Enquiries;

/// <summary>
/// Banner quote enquiry service (Jira 9512). Submission is anonymous (storefront); listing/detail/review
/// are admin-only. No method ever creates an order or a payment session.
/// </summary>
public interface IBannerQuoteRequestAppService : IApplicationService
{
    /// <summary>Storefront: submit a Banner quote enquiry. Validates + normalizes; no order/payment.</summary>
    Task<BannerEnquiryResultDto> CreateAsync(CreateBannerEnquiryDto input);

    /// <summary>Admin: list enquiries (optionally filtered by status), newest first.</summary>
    Task<PagedResultDto<BannerQuoteRequestDto>> GetListAsync(GetBannerQuoteRequestsInput input);

    /// <summary>Admin: get a single enquiry.</summary>
    Task<BannerQuoteRequestDto> GetAsync(Guid id);

    /// <summary>Admin: mark an enquiry as reviewed.</summary>
    Task<BannerQuoteRequestDto> MarkReviewedAsync(Guid id);

    /// <summary>Admin: cancel an enquiry (only when New/Reviewed).</summary>
    Task<BannerQuoteRequestDto> CancelAsync(Guid id);

    /// <summary>
    /// Admin: convert a New/Reviewed enquiry into an UNPAID priced order using the admin-entered total.
    /// No payment is taken and no payment session is created. Sets the enquiry to ConvertedToOrder and
    /// links the created order.
    /// </summary>
    Task<ConvertBannerQuoteRequestResultDto> ConvertToOrderAsync(Guid id, ConvertBannerQuoteRequestDto input);
}
