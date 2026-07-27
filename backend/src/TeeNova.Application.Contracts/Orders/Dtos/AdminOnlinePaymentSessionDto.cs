using System;
using TeeNova.Payments;

namespace TeeNova.Orders.Dtos;

public enum AdminPaymentReconciliationStatus
{
    Reconciled,
    Pending,
    RequiresReview,
    Failed,
    Cancelled,
    Expired,
}

/// <summary>
/// Admin-only, explicit reconciliation projection. It intentionally contains no checkout URL,
/// provider payload, secret, ciphertext, card or customer payment-method data.
/// </summary>
public sealed class AdminOnlinePaymentSessionDto
{
    public Guid Id { get; set; }
    public PaymentProvider Provider { get; set; }
    public PaymentProviderMode? ProviderMode { get; set; }
    public PaymentPurpose Purpose { get; set; }
    public OnlinePaymentSessionStatus Status { get; set; }
    public string Currency { get; set; } = default!;

    public decimal BaseAmount { get; set; }
    public decimal SurchargeAmount { get; set; }
    public decimal ChargedAmount { get; set; }
    public int SurchargePercentageBasisPoints { get; set; }
    public decimal SurchargeFixedAmount { get; set; }
    public string SurchargeCalculationVersion { get; set; } = default!;

    public string ProviderSessionId { get; set; } = default!;
    public string? ProviderPaymentId { get; set; }
    public string? ProviderEventId { get; set; }
    public Guid? PaymentTransactionId { get; set; }
    public decimal? CommercialTransactionAmount { get; set; }

    public DateTime CreationTime { get; set; }
    public DateTime? CompletedTime { get; set; }
    public string? RawProviderStatus { get; set; }

    public PaymentWebhookEventStatus? WebhookStatus { get; set; }
    public decimal? ObservedProviderAmount { get; set; }
    public string? ObservedCurrency { get; set; }
    public string? ReviewReasonCode { get; set; }

    public AdminPaymentReconciliationStatus ReconciliationStatus { get; set; }
    public string? ReconciliationMessage { get; set; }
}
