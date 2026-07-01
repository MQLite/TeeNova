using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using TeeNova.Enquiries.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Enquiries;

/// <summary>
/// Banner quote enquiry API (Jira 9512). The customer submission (<see cref="CreateAsync"/>) is
/// <see cref="AllowAnonymousAttribute">anonymous</see> (storefront, mirrors the anonymous order-create
/// path); the admin review endpoints inherit the controller-level <see cref="AuthorizeAttribute"/>.
/// Nothing here creates an order or a payment session.
/// </summary>
[ApiController]
[Route("api/banner-enquiries")]
[Authorize]
public class BannerEnquiryController : TeeNovaControllerBase
{
    private readonly IBannerQuoteRequestAppService _appService;

    public BannerEnquiryController(IBannerQuoteRequestAppService appService)
    {
        _appService = appService;
    }

    /// <summary>Storefront: submit a Banner quote enquiry. No payment, no order.</summary>
    [HttpPost]
    [AllowAnonymous]
    public async Task<BannerEnquiryResultDto> CreateAsync([FromBody] CreateBannerEnquiryDto input)
        => await _appService.CreateAsync(input);

    /// <summary>Admin: list Banner enquiries (optionally filtered by status), newest first.</summary>
    [HttpGet]
    public async Task<PagedResultDto<BannerQuoteRequestDto>> GetListAsync([FromQuery] GetBannerQuoteRequestsInput input)
        => await _appService.GetListAsync(input);

    /// <summary>Admin: get a single Banner enquiry.</summary>
    [HttpGet("{id:guid}")]
    public async Task<BannerQuoteRequestDto> GetAsync(Guid id)
        => await _appService.GetAsync(id);

    /// <summary>Admin: mark a Banner enquiry as reviewed.</summary>
    [HttpPost("{id:guid}/mark-reviewed")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<BannerQuoteRequestDto> MarkReviewedAsync(Guid id)
        => await _appService.MarkReviewedAsync(id);

    /// <summary>Admin: cancel a Banner enquiry.</summary>
    [HttpPost("{id:guid}/cancel")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<BannerQuoteRequestDto> CancelAsync(Guid id)
        => await _appService.CancelAsync(id);

    /// <summary>
    /// Admin: convert a Banner enquiry into an unpaid priced order using the admin-entered total.
    /// No payment is taken and no payment session is created.
    /// </summary>
    [HttpPost("{id:guid}/convert-to-order")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<ConvertBannerQuoteRequestResultDto> ConvertToOrderAsync(
        Guid id, [FromBody] ConvertBannerQuoteRequestDto input)
        => await _appService.ConvertToOrderAsync(id, input);
}
