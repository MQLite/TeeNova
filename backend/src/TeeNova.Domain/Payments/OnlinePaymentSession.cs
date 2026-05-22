using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Payments;

/// <summary>
/// Tracks the lifecycle of a single hosted-checkout session with an online payment provider.
/// Created when a customer initiates online payment; updated by webhook events.
/// Does not create PaymentTransactions — that is the app service's responsibility after MarkCompleted.
/// </summary>
public class OnlinePaymentSession : CreationAuditedEntity<Guid>
{
    public Guid                       OrderId              { get; private set; }
    public string                     OrderNumber          { get; private set; } = default!;
    public PaymentProvider            Provider             { get; private set; }
    public string                     ProviderSessionId    { get; private set; } = default!;
    public string                     ProviderCheckoutUrl  { get; private set; } = default!;
    public decimal                    Amount               { get; private set; }
    public string                     Currency             { get; private set; } = default!;
    public PaymentPurpose             Purpose              { get; private set; }
    public OnlinePaymentSessionStatus Status               { get; private set; }
    public DateTime?                  CompletedAt          { get; private set; }
    public string?                    ProviderPaymentId    { get; private set; }
    public string?                    LastProviderEventId  { get; private set; }
    public string?                    RawProviderStatus    { get; private set; }
    public Guid?                      PaymentTransactionId { get; private set; }

    protected OnlinePaymentSession() { }

    public static OnlinePaymentSession Create(
        Guid           id,
        Guid           orderId,
        string         orderNumber,
        PaymentProvider provider,
        string         providerSessionId,
        string         providerCheckoutUrl,
        decimal        amount,
        string         currency,
        PaymentPurpose purpose)
    {
        if (id == Guid.Empty)
            throw new ArgumentException("Id cannot be empty.", nameof(id));
        if (orderId == Guid.Empty)
            throw new ArgumentException("OrderId cannot be empty.", nameof(orderId));
        Check.NotNullOrWhiteSpace(orderNumber,         nameof(orderNumber));
        Check.NotNullOrWhiteSpace(providerSessionId,   nameof(providerSessionId));
        Check.NotNullOrWhiteSpace(providerCheckoutUrl, nameof(providerCheckoutUrl));
        Check.NotNullOrWhiteSpace(currency,            nameof(currency));

        if (provider == PaymentProvider.None)
            throw new ArgumentException("Provider cannot be None.", nameof(provider));

        if (amount <= 0)
            throw new ArgumentException("Amount must be greater than zero.", nameof(amount));

        if (!Enum.IsDefined(typeof(PaymentPurpose), purpose))
            throw new ArgumentException($"Invalid PaymentPurpose value: {purpose}.", nameof(purpose));

        return new OnlinePaymentSession
        {
            Id                  = id,
            OrderId             = orderId,
            OrderNumber         = orderNumber.Trim(),
            Provider            = provider,
            ProviderSessionId   = providerSessionId.Trim(),
            ProviderCheckoutUrl = providerCheckoutUrl.Trim(),
            Amount              = amount,
            Currency            = currency.Trim().ToUpperInvariant(),
            Purpose             = purpose,
            Status              = OnlinePaymentSessionStatus.Pending,
            CompletedAt         = null,
            ProviderPaymentId   = null,
            LastProviderEventId = null,
            RawProviderStatus   = null,
            PaymentTransactionId = null,
        };
    }

    public void MarkCompleted(
        string?  providerPaymentId,
        string?  providerEventId,
        string?  rawProviderStatus,
        Guid     paymentTransactionId,
        DateTime completedAt)
    {
        if (Status != OnlinePaymentSessionStatus.Pending)
            throw new InvalidOperationException(
                $"Cannot mark session as Completed from state {Status}.");

        if (paymentTransactionId == Guid.Empty)
            throw new ArgumentException("PaymentTransactionId cannot be empty.", nameof(paymentTransactionId));

        Status               = OnlinePaymentSessionStatus.Completed;
        CompletedAt          = completedAt;
        ProviderPaymentId    = Normalize(providerPaymentId);
        LastProviderEventId  = Normalize(providerEventId);
        RawProviderStatus    = Normalize(rawProviderStatus);
        PaymentTransactionId = paymentTransactionId;
    }

    public void MarkCancelled(string? providerEventId = null, string? rawProviderStatus = null)
    {
        if (Status != OnlinePaymentSessionStatus.Pending)
            throw new InvalidOperationException(
                $"Cannot mark session as Cancelled from state {Status}.");

        Status              = OnlinePaymentSessionStatus.Cancelled;
        LastProviderEventId = Normalize(providerEventId);
        RawProviderStatus   = Normalize(rawProviderStatus);
    }

    public void MarkExpired(string? providerEventId = null, string? rawProviderStatus = null)
    {
        if (Status != OnlinePaymentSessionStatus.Pending)
            throw new InvalidOperationException(
                $"Cannot mark session as Expired from state {Status}.");

        Status              = OnlinePaymentSessionStatus.Expired;
        LastProviderEventId = Normalize(providerEventId);
        RawProviderStatus   = Normalize(rawProviderStatus);
    }

    public void MarkFailed(
        string? providerPaymentId  = null,
        string? providerEventId    = null,
        string? rawProviderStatus  = null)
    {
        if (Status != OnlinePaymentSessionStatus.Pending)
            throw new InvalidOperationException(
                $"Cannot mark session as Failed from state {Status}.");

        Status              = OnlinePaymentSessionStatus.Failed;
        ProviderPaymentId   = Normalize(providerPaymentId);
        LastProviderEventId = Normalize(providerEventId);
        RawProviderStatus   = Normalize(rawProviderStatus);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
