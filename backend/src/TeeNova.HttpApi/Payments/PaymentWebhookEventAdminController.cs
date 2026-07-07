using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Payments.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Payments;

/// <summary>
/// Admin READ-ONLY reconciliation surface for durable provider webhook events (Jira 9810).
///
/// Controller-level <see cref="AuthorizeAttribute"/> (no role) means any authenticated admin-panel user
/// — Admin or Viewer — can READ this data; the app never issues tokens to customers, so this is never
/// reachable anonymously. There are deliberately NO mutation actions here: 9810 provides visibility only,
/// so nothing can resolve a manual-review item, apply payment, mark an order paid, or call a provider.
/// Reconciliation data is intentionally kept off the public/customer routes.
/// </summary>
[ApiController]
[Route("api/admin/payment-webhook-events")]
[Authorize]
public class PaymentWebhookEventAdminController : TeeNovaControllerBase
{
    private readonly IPaymentWebhookEventAdminAppService _appService;

    public PaymentWebhookEventAdminController(IPaymentWebhookEventAdminAppService appService)
    {
        _appService = appService;
    }

    /// <summary>Lists webhook events (manual-review first, then most-recent) with optional filters.</summary>
    [HttpGet]
    public Task<PagedResultDto<PaymentWebhookEventDto>> GetListAsync(
        [FromQuery] GetPaymentWebhookEventsInput input)
        => _appService.GetListAsync(input);

    /// <summary>Gets a single webhook event with safe correlation detail.</summary>
    [HttpGet("{id:guid}")]
    public Task<PaymentWebhookEventDto> GetAsync(Guid id)
        => _appService.GetAsync(id);
}
