using System;
using System.Collections.Generic;

namespace TeeNova.Payments;

/// <summary>
/// Provider-neutral request passed to IOnlinePaymentProvider.CreatePaymentSessionAsync.
/// Contains all information needed to create a hosted checkout session regardless of provider.
///
/// Phase 3 adds an optional server-authoritative pricing snapshot. Every value on it originates from
/// <c>OrderAppService</c> + <c>IStripePaymentQuoteService</c> — never from the browser. Providers with no
/// surcharge model simply ignore the snapshot: <see cref="BaseAmount"/> defaults to <see cref="Amount"/>,
/// <see cref="SurchargeAmount"/> stays zero, and the legacy calculation version / null mode are preserved.
/// </summary>
public class CreateOnlinePaymentProviderSessionRequest
{
    private decimal? _baseAmount;

    public Guid   OrderId       { get; set; }
    public string OrderNumber   { get; set; } = string.Empty;
    public PaymentProvider Provider { get; set; }
    public PaymentPurpose  Purpose  { get; set; }

    /// <summary>Total handed to the provider — the amount charged to the card (base + surcharge).</summary>
    public decimal Amount          { get; set; }

    public string  Currency        { get; set; } = "NZD";
    public string  CustomerEmail   { get; set; } = string.Empty;
    public string  SuccessUrl      { get; set; } = string.Empty;
    public string  CancelUrl       { get; set; } = string.Empty;

    /// <summary>
    /// Local <c>OnlinePaymentSession</c> id, generated BEFORE the provider call so the provider can attach it
    /// as correlation metadata and the local row can be persisted under the very same id afterwards.
    /// </summary>
    public Guid PaymentSessionId { get; set; }

    // ── Server-authoritative pricing snapshot (Phase 3) ───────────────────────

    /// <summary>Commercial amount due, excluding surcharge. Defaults to <see cref="Amount"/> when never set.</summary>
    public decimal BaseAmount
    {
        get => _baseAmount ?? Amount;
        set => _baseAmount = value;
    }

    /// <summary>Card-processing surcharge included in <see cref="Amount"/>. Zero for legacy/non-Stripe requests.</summary>
    public decimal SurchargeAmount { get; set; }

    public bool    SurchargeEnabled               { get; set; }
    public int     SurchargePercentageBasisPoints { get; set; }
    public decimal SurchargeFixedAmount           { get; set; }

    public string SurchargeCalculationVersion { get; set; } = StripeSurchargeDefaults.LegacyCalculationVersion;

    /// <summary>Test/Live mode the quote was resolved under. Null for legacy/non-Stripe requests.</summary>
    public PaymentProviderMode? ProviderMode { get; set; }

    /// <summary>
    /// Fingerprint of the resolved quote. When present, the Stripe provider re-resolves the current settings
    /// and rejects the request before any Stripe API call if the fingerprint no longer matches.
    /// </summary>
    public string? PaymentQuoteFingerprint { get; set; }

    /// <summary>
    /// Arbitrary key-value metadata forwarded to the provider (e.g. order id, purpose).
    /// Provider implementations decide which fields to attach as provider-side metadata.
    /// </summary>
    public Dictionary<string, string> Metadata { get; set; } = new();
}
