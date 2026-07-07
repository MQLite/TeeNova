using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Payments;

/// <summary>
/// Durable idempotency/replay record for a single verified provider webhook event (Jira 9806).
///
/// One row per (<see cref="Provider"/>, <see cref="ProviderEventId"/>). The unique index on that pair is
/// the first replay guard: a re-delivered event that already reached a terminal-processed
/// <see cref="PaymentWebhookEventStatus"/> is acknowledged without re-running any payment side effect.
///
/// This record captures enough safe, non-secret context for later admin reconciliation (Jira 9810).
/// It intentionally stores NO raw webhook body, NO provider secrets, and NO card details.
/// </summary>
public class PaymentWebhookEvent : CreationAuditedEntity<Guid>
{
    public PaymentProvider              Provider               { get; private set; }
    public string                       ProviderEventId        { get; private set; } = default!;
    public string?                      ProviderEventType      { get; private set; }
    public string?                      ProviderSessionId      { get; private set; }
    public string?                      PaymentIntentId        { get; private set; }
    public PaymentWebhookEventStatus    Status                 { get; private set; }
    public Guid?                        OrderId                { get; private set; }
    public Guid?                        OnlinePaymentSessionId { get; private set; }
    public decimal?                     Amount                 { get; private set; }
    public string?                      Currency               { get; private set; }
    public string?                      RejectionCode          { get; private set; }
    public bool                         RequiresManualReview   { get; private set; }
    public string?                      Message                { get; private set; }
    public DateTime                     ReceivedAt             { get; private set; }
    public DateTime?                    ProcessedAt            { get; private set; }
    public DateTime?                    LastSeenAt             { get; private set; }
    public int                          DuplicateCount         { get; private set; }

    protected PaymentWebhookEvent() { }

    public static PaymentWebhookEvent Create(
        Guid            id,
        PaymentProvider provider,
        string          providerEventId,
        string?         providerEventType,
        string?         providerSessionId,
        string?         paymentIntentId,
        decimal?        amount,
        string?         currency,
        DateTime        receivedAt)
    {
        if (id == Guid.Empty)
            throw new ArgumentException("Id cannot be empty.", nameof(id));
        if (provider == PaymentProvider.None)
            throw new ArgumentException("Provider cannot be None.", nameof(provider));
        Check.NotNullOrWhiteSpace(providerEventId, nameof(providerEventId));

        return new PaymentWebhookEvent
        {
            Id                     = id,
            Provider               = provider,
            ProviderEventId        = providerEventId.Trim(),
            ProviderEventType      = Normalize(providerEventType),
            ProviderSessionId      = Normalize(providerSessionId),
            PaymentIntentId        = Normalize(paymentIntentId),
            Status                 = PaymentWebhookEventStatus.Received,
            Amount                 = amount,
            Currency               = Normalize(currency),
            RequiresManualReview   = false,
            ReceivedAt             = receivedAt,
            LastSeenAt             = receivedAt,
            DuplicateCount         = 0,
        };
    }

    /// <summary>Payment applied / terminal session update performed exactly once.</summary>
    public void MarkProcessed(Guid? orderId, Guid? sessionId, DateTime processedAt)
    {
        EnsureNotTerminal(PaymentWebhookEventStatus.Processed);
        Status                 = PaymentWebhookEventStatus.Processed;
        OrderId                = orderId    ?? OrderId;
        OnlinePaymentSessionId = sessionId  ?? OnlinePaymentSessionId;
        RequiresManualReview   = false;
        RejectionCode          = null;
        ProcessedAt            = processedAt;
    }

    /// <summary>Valid verified event that required no local action.</summary>
    public void MarkIgnored(string? reason, DateTime processedAt, Guid? orderId = null, Guid? sessionId = null)
    {
        EnsureNotTerminal(PaymentWebhookEventStatus.Ignored);
        Status                 = PaymentWebhookEventStatus.Ignored;
        OrderId                = orderId    ?? OrderId;
        OnlinePaymentSessionId = sessionId  ?? OnlinePaymentSessionId;
        RequiresManualReview   = false;
        Message                = Normalize(reason);
        ProcessedAt            = processedAt;
    }

    /// <summary>Structurally rejected event with no evidence of a customer charge.</summary>
    public void MarkRejected(string? rejectionCode, string? message, DateTime processedAt,
                             Guid? orderId = null, Guid? sessionId = null)
    {
        EnsureNotTerminal(PaymentWebhookEventStatus.Rejected);
        Status                 = PaymentWebhookEventStatus.Rejected;
        OrderId                = orderId    ?? OrderId;
        OnlinePaymentSessionId = sessionId  ?? OnlinePaymentSessionId;
        RequiresManualReview   = false;
        RejectionCode          = Normalize(rejectionCode);
        Message                = Normalize(message);
        ProcessedAt            = processedAt;
    }

    /// <summary>
    /// Verified event that cannot be applied locally but may correspond to a real customer charge
    /// (e.g. a completed checkout for a session that was already cancelled/superseded, or an
    /// amount/currency mismatch). Flagged for Jira 9810 reconciliation.
    /// </summary>
    public void MarkRequiresManualReview(string? rejectionCode, string? message, DateTime processedAt,
                                         Guid? orderId = null, Guid? sessionId = null)
    {
        EnsureNotTerminal(PaymentWebhookEventStatus.RequiresManualReview);
        Status                 = PaymentWebhookEventStatus.RequiresManualReview;
        OrderId                = orderId    ?? OrderId;
        OnlinePaymentSessionId = sessionId  ?? OnlinePaymentSessionId;
        RequiresManualReview   = true;
        RejectionCode          = Normalize(rejectionCode);
        Message                = Normalize(message);
        ProcessedAt            = processedAt;
    }

    /// <summary>An unexpected/infrastructure failure occurred; a re-delivery may re-attempt.</summary>
    public void MarkFailed(string? message)
    {
        EnsureNotTerminal(PaymentWebhookEventStatus.Failed);
        Status  = PaymentWebhookEventStatus.Failed;
        Message = Normalize(message);
    }

    /// <summary>
    /// Guards terminal immutability (Jira 9807): once an event has reached a durable outcome it must not
    /// be transitioned again. In the normal flow this never fires — the app service short-circuits a
    /// re-delivered terminal event to <see cref="RegisterDuplicate"/> before any Mark* call — so this is a
    /// defense-in-depth backstop against a future code path re-processing a settled event.
    /// </summary>
    private void EnsureNotTerminal(PaymentWebhookEventStatus target)
    {
        if (IsTerminal)
            throw new InvalidOperationException(
                $"Cannot transition webhook event from terminal state {Status} to {target}.");
    }

    /// <summary>Record that an already-terminal event was seen again (replay telemetry for 9810).</summary>
    public void RegisterDuplicate(DateTime seenAt)
    {
        DuplicateCount += 1;
        LastSeenAt      = seenAt;
    }

    /// <summary>True once this event has reached a durable outcome; a re-delivery must not re-run business logic.</summary>
    public bool IsTerminal =>
        Status is PaymentWebhookEventStatus.Processed
               or PaymentWebhookEventStatus.Duplicate
               or PaymentWebhookEventStatus.Ignored
               or PaymentWebhookEventStatus.Rejected
               or PaymentWebhookEventStatus.RequiresManualReview;

    private static string? Normalize(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
