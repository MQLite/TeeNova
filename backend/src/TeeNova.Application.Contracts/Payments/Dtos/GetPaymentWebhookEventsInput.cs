using System;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Payments.Dtos;

/// <summary>
/// Paged/filtered query for the admin webhook-event reconciliation list (Jira 9810). All filters are
/// optional; the default ordering surfaces RequiresManualReview items first, then most-recent.
/// </summary>
public class GetPaymentWebhookEventsInput : PagedResultRequestDto
{
    public bool?                      RequiresManualReview { get; set; }
    public PaymentWebhookEventStatus? Status               { get; set; }
    public PaymentProvider?           Provider             { get; set; }
    public Guid?                      OrderId              { get; set; }
    public string?                    ProviderSessionId    { get; set; }
    public DateTime?                  FromDate             { get; set; }
    public DateTime?                  ToDate               { get; set; }
}
