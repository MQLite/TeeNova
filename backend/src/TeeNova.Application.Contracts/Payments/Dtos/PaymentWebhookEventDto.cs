using System;

namespace TeeNova.Payments.Dtos;

/// <summary>
/// Admin-facing, read-only projection of a durable provider webhook event (Jira 9806 record, Jira 9810
/// reconciliation surface). Carries ONLY safe correlation/diagnostic fields — the underlying entity stores
/// no raw webhook body, no secrets and no card data, and this DTO adds none. Never returned by a public /
/// anonymous endpoint.
/// </summary>
public class PaymentWebhookEventDto
{
    public Guid                       Id                     { get; set; }
    public PaymentProvider            Provider               { get; set; }
    public string                     ProviderEventId        { get; set; } = string.Empty;
    public string?                    ProviderEventType      { get; set; }
    public string?                    ProviderSessionId      { get; set; }
    public string?                    PaymentIntentId        { get; set; }
    public PaymentWebhookEventStatus  Status                 { get; set; }
    public bool                       RequiresManualReview   { get; set; }
    public string?                    RejectionCode          { get; set; }
    public string?                    Message                { get; set; }
    public Guid?                      OrderId                { get; set; }
    /// <summary>Joined from the order when present — convenience for the reconciliation view.</summary>
    public string?                    OrderNumber            { get; set; }
    public Guid?                      OnlinePaymentSessionId { get; set; }
    public decimal?                   Amount                 { get; set; }
    public string?                    Currency               { get; set; }
    public DateTime                   ReceivedAt             { get; set; }
    public DateTime?                  ProcessedAt            { get; set; }
    public DateTime?                  LastSeenAt             { get; set; }
    public int                        DuplicateCount         { get; set; }
}
