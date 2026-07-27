namespace TeeNova.Payments.Dtos;

/// <summary>
/// Safe, customer-facing projection of a server-authoritative online payment quote (Phase 3).
///
/// Contains display values and the stale-detection fingerprint only. It deliberately exposes NO secret key,
/// webhook secret, ciphertext, encryption material, provider mode, concurrency token or settings entity.
/// The browser may echo <see cref="QuoteFingerprint"/> back when creating a payment session; it may never
/// submit any monetary value — every amount is recalculated server-side before a provider session is created.
/// </summary>
public class OnlinePaymentQuoteDto
{
    public PaymentProvider Provider { get; set; }

    public string Currency { get; set; } = "NZD";

    /// <summary>Payment purpose the server derived from the order/draft state (Deposit, Balance, FullPayment).</summary>
    public PaymentPurpose Purpose { get; set; }

    /// <summary>Commercial amount due — the only amount ever applied to the order.</summary>
    public decimal BaseAmount { get; set; }

    public bool SurchargeEnabled { get; set; }

    /// <summary>Card-processing surcharge. Zero when surcharge is disabled.</summary>
    public decimal SurchargeAmount { get; set; }

    /// <summary>Total the card will be charged: <see cref="BaseAmount"/> + <see cref="SurchargeAmount"/>.</summary>
    public decimal ChargedAmount { get; set; }

    /// <summary>Disclosure that must be shown before the customer continues. Null when surcharge is disabled.</summary>
    public string? SurchargeDisclosureText { get; set; }

    /// <summary>Display-only rate in basis points (265 = 2.65%). Zero when surcharge is disabled.</summary>
    public int SurchargePercentageBasisPoints { get; set; }

    /// <summary>Display-only fixed component in NZD. Zero when surcharge is disabled.</summary>
    public decimal SurchargeFixedAmount { get; set; }

    /// <summary>Frozen calculation contract used to derive the amounts.</summary>
    public string CalculationVersion { get; set; } = string.Empty;

    /// <summary>
    /// Deterministic fingerprint of the displayed values. Echo it back on session creation so the server can
    /// reject a payment attempt based on a stale disclosure. Empty for providers that issue no quote contract.
    /// </summary>
    public string QuoteFingerprint { get; set; } = string.Empty;
}
