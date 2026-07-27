using System;

namespace TeeNova.Payments;

/// <summary>
/// Server-authoritative, immutable pricing snapshot for one Stripe payment attempt (Phase 3).
///
/// Every monetary value here is derived on the server from trusted commercial pricing and the persisted
/// Test/Live surcharge configuration — no part of it may originate from the browser. It carries NO secret
/// material, so it is safe to hand to the provider layer and to project (partially) into a public DTO.
///
/// The snapshot is the single input to: the public quote DTO, the quote fingerprint, pending-session
/// matching, the Stripe Checkout line items/metadata, and <c>OnlinePaymentSession.CreateWithPaymentSnapshot</c>.
/// </summary>
public sealed record StripePaymentQuoteSnapshot
{
    internal StripePaymentQuoteSnapshot(
        PaymentProvider     provider,
        PaymentProviderMode providerMode,
        string              currency,
        PaymentPurpose      purpose,
        long                baseAmountCents,
        long                surchargeAmountCents,
        long                chargedAmountCents,
        bool                surchargeEnabled,
        int                 surchargePercentageBasisPoints,
        long                surchargeFixedAmountCents,
        string              surchargeCalculationVersion,
        string              disclosureText,
        string              quoteFingerprint)
    {
        Provider                       = provider;
        ProviderMode                   = providerMode;
        Currency                       = currency;
        Purpose                        = purpose;
        BaseAmountCents                = baseAmountCents;
        SurchargeAmountCents           = surchargeAmountCents;
        ChargedAmountCents             = chargedAmountCents;
        SurchargeEnabled               = surchargeEnabled;
        SurchargePercentageBasisPoints = surchargePercentageBasisPoints;
        SurchargeFixedAmountCents      = surchargeFixedAmountCents;
        SurchargeCalculationVersion    = surchargeCalculationVersion;
        DisclosureText                 = disclosureText;
        QuoteFingerprint               = quoteFingerprint;
    }

    public PaymentProvider     Provider     { get; }
    public PaymentProviderMode ProviderMode { get; }
    public string              Currency     { get; }
    public PaymentPurpose      Purpose      { get; }

    public long BaseAmountCents      { get; }
    public long SurchargeAmountCents { get; }
    public long ChargedAmountCents   { get; }

    public bool   SurchargeEnabled               { get; }
    public int    SurchargePercentageBasisPoints { get; }
    public long   SurchargeFixedAmountCents      { get; }
    public string SurchargeCalculationVersion    { get; }

    /// <summary>Customer-facing disclosure in force for this quote. Non-secret; safe to display.</summary>
    public string DisclosureText { get; }

    /// <summary>
    /// Deterministic hash of every customer-relevant quoted value. Proves the client is acting on the
    /// values it displayed — NOT an authorisation token, and never a substitute for recalculation.
    /// </summary>
    public string QuoteFingerprint { get; }

    public decimal BaseAmount           => StripeMoney.FromCents(BaseAmountCents);
    public decimal SurchargeAmount      => StripeMoney.FromCents(SurchargeAmountCents);
    public decimal ChargedAmount        => StripeMoney.FromCents(ChargedAmountCents);
    public decimal SurchargeFixedAmount => StripeMoney.FromCents(SurchargeFixedAmountCents);
}

/// <summary>
/// Internal-process-only pairing of a freshly resolved Stripe configuration (WITH decrypted secrets) and the
/// quote snapshot derived from it.
///
/// SECURITY: <see cref="Settings"/> carries the decrypted secret key and webhook secret. This type must never
/// be serialized, logged, returned from an HTTP endpoint, or mapped into any DTO. Only
/// <see cref="Quote"/> may leave the application layer.
/// </summary>
public sealed record StripeResolvedCheckoutQuote(
    ResolvedStripePaymentSettings Settings,
    StripePaymentQuoteSnapshot    Quote);
