using System;
using System.Threading.Tasks;
using TeeNova.Payments.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Payments;

/// <summary>
/// Admin READ-ONLY reconciliation surface over durable provider webhook events (Jira 9810). Exposes no
/// mutation: it neither resolves manual-review items, marks orders paid, nor calls any provider. Intended
/// for the admin panel (Admin or Viewer read); never wired to a public/customer route.
/// </summary>
public interface IPaymentWebhookEventAdminAppService : IApplicationService
{
    /// <summary>Lists webhook events with optional filters; manual-review items first, then most-recent.</summary>
    Task<PagedResultDto<PaymentWebhookEventDto>> GetListAsync(GetPaymentWebhookEventsInput input);

    /// <summary>Gets a single webhook event with safe correlation detail.</summary>
    Task<PaymentWebhookEventDto> GetAsync(Guid id);
}
