using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Payments;

/// <summary>
/// Tracks the lifecycle of a single hosted-checkout session with an online payment provider.
/// Created when a customer initiates online payment; updated by webhook events.
/// Does not create PaymentTransactions — that is the app service's responsibility after MarkCompleted.
///
/// The session also carries an immutable pricing snapshot (Phase 2B) that separates the commercial amount
/// due (<see cref="BaseAmount"/>) from the card-processing surcharge (<see cref="SurchargeAmount"/>) and
/// records the surcharge configuration in force when the provider Session was created. <see cref="Amount"/>
/// remains the amount handed to the provider, so <c>Amount = BaseAmount + SurchargeAmount</c> always holds.
///
/// Every session created by the current runtime is a LEGACY session: <see cref="Create"/> stamps a zero
/// surcharge, a zero rate, a zero fixed fee, <see cref="StripeSurchargeDefaults.LegacyCalculationVersion"/>
/// and a null <see cref="ProviderMode"/>, which makes <c>Amount == BaseAmount</c>. The surcharge-aware
/// path (<see cref="CreateWithPaymentSnapshot"/>) exists to establish and test the Phase 3 invariants and is
/// deliberately not consumed by payment orchestration yet.
/// </summary>
public class OnlinePaymentSession : CreationAuditedEntity<Guid>
{
    /// <summary>Exclusive upper bound for a surcharge rate in basis points (10,000 bp = 100%).</summary>
    public const int    BasisPointsScale                 = 10_000;

    public const string LegacyCalculationVersion         = StripeSurchargeDefaults.LegacyCalculationVersion;
    public const int    MaxCalculationVersionLength      = StripeSurchargeDefaults.MaxCalculationVersionLength;

    public Guid                       OrderId              { get; private set; }
    public string                     OrderNumber          { get; private set; } = default!;
    public PaymentProvider            Provider             { get; private set; }
    public string                     ProviderSessionId    { get; private set; } = default!;
    public string                     ProviderCheckoutUrl  { get; private set; } = default!;

    /// <summary>
    /// The amount handed to the payment provider for this session — i.e. the total charged to the card.
    /// Unchanged by Phase 2B; existing webhook and order-payment logic still reads this property.
    /// </summary>
    public decimal                    Amount               { get; private set; }

    public string                     Currency             { get; private set; } = default!;
    public PaymentPurpose             Purpose              { get; private set; }
    public OnlinePaymentSessionStatus Status               { get; private set; }
    public DateTime?                  CompletedAt          { get; private set; }
    public string?                    ProviderPaymentId    { get; private set; }
    public string?                    LastProviderEventId  { get; private set; }
    public string?                    RawProviderStatus    { get; private set; }
    public Guid?                      PaymentTransactionId { get; private set; }

    // ── Immutable pricing snapshot (Jira Stripe surcharge, Phase 2B) ──────────
    // Set once at construction; never mutated by any lifecycle transition.

    /// <summary>Commercial amount due for the payment purpose, excluding all card-processing surcharge.</summary>
    public decimal                    BaseAmount           { get; private set; }

    /// <summary>Amount added solely because of the selected payment method. Zero for legacy sessions.</summary>
    public decimal                    SurchargeAmount      { get; private set; }

    /// <summary>Snapshot of the configured surcharge rate in basis points (265 = 2.65%). Zero for legacy sessions.</summary>
    public int                        SurchargePercentageBasisPoints { get; private set; }

    /// <summary>Snapshot of the configured fixed fee in NZD. Zero for legacy sessions.</summary>
    public decimal                    SurchargeFixedAmount { get; private set; }

    /// <summary>
    /// Calculation contract used to derive the snapshot: <see cref="StripeSurchargeDefaults.CalculationVersion"/>
    /// for a surcharge-aware session, <see cref="LegacyCalculationVersion"/> for a legacy one.
    /// </summary>
    public string                     SurchargeCalculationVersion { get; private set; } = LegacyCalculationVersion;

    /// <summary>
    /// Test or Live mode under which the provider Session was created. Null for legacy and historical
    /// records, whose mode cannot be proven from durable stored data; a surcharge-aware session always has one.
    /// </summary>
    public PaymentProviderMode?       ProviderMode         { get; private set; }

    /// <summary>
    /// Non-persisted alias making the accounting boundary explicit: the total charged is always
    /// <see cref="Amount"/>, while only <see cref="BaseAmount"/> is commercially owed.
    /// </summary>
    public decimal ChargedAmount => Amount;

    protected OnlinePaymentSession() { }

    /// <summary>
    /// Creates a LEGACY (no-surcharge) session — the only path used by payment orchestration today.
    /// <paramref name="amount"/> is both the commercial base amount and the amount charged, so the pricing
    /// snapshot is stamped as zero-surcharge with no provider mode. Existing callers are unaffected.
    /// </summary>
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

            // Legacy snapshot: charged total equals the commercial base amount.
            BaseAmount                     = amount,
            SurchargeAmount                = 0m,
            SurchargePercentageBasisPoints = 0,
            SurchargeFixedAmount           = 0m,
            SurchargeCalculationVersion    = LegacyCalculationVersion,
            ProviderMode                   = null,
        };
    }

    /// <summary>
    /// Creates a SURCHARGE-AWARE session carrying a complete immutable pricing snapshot.
    ///
    /// Not consumed by payment orchestration in Phase 2B — it exists so the Phase 3 invariants
    /// (<c>chargedAmount = baseAmount + surchargeAmount</c>, exact cent alignment, a known calculation
    /// version and a real provider mode) are established and tested before any runtime integration.
    /// </summary>
    public static OnlinePaymentSession CreateWithPaymentSnapshot(
        Guid                id,
        Guid                orderId,
        string              orderNumber,
        PaymentProvider     provider,
        string              providerSessionId,
        string              providerCheckoutUrl,
        string              currency,
        PaymentPurpose      purpose,
        decimal             baseAmount,
        decimal             surchargeAmount,
        decimal             chargedAmount,
        int                 surchargePercentageBasisPoints,
        decimal             surchargeFixedAmount,
        string              surchargeCalculationVersion,
        PaymentProviderMode providerMode)
    {
        if (baseAmount <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(baseAmount), baseAmount, "Base amount must be greater than zero.");

        if (surchargeAmount < 0)
            throw new ArgumentOutOfRangeException(
                nameof(surchargeAmount), surchargeAmount, "Surcharge amount must not be negative.");

        RequireCentAligned(baseAmount,           nameof(baseAmount));
        RequireCentAligned(surchargeAmount,      nameof(surchargeAmount));
        RequireCentAligned(chargedAmount,        nameof(chargedAmount));
        RequireCentAligned(surchargeFixedAmount, nameof(surchargeFixedAmount));

        // Exact decimal equality — a surcharge snapshot never tolerates drift between its parts and its total.
        if (chargedAmount != baseAmount + surchargeAmount)
            throw new ArgumentException(
                "Charged amount must equal base amount plus surcharge amount.", nameof(chargedAmount));

        if (surchargePercentageBasisPoints < 0 || surchargePercentageBasisPoints >= BasisPointsScale)
            throw new ArgumentOutOfRangeException(
                nameof(surchargePercentageBasisPoints),
                surchargePercentageBasisPoints,
                "Percentage basis points must be between 0 and 9,999.");

        if (surchargeFixedAmount < 0)
            throw new ArgumentOutOfRangeException(
                nameof(surchargeFixedAmount), surchargeFixedAmount, "Fixed amount must not be negative.");

        if (!string.Equals(
                surchargeCalculationVersion?.Trim(),
                StripeSurchargeCalculator.CurrentCalculationVersion,
                StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "Unsupported surcharge calculation version.", nameof(surchargeCalculationVersion));
        }

        if (!Enum.IsDefined(typeof(PaymentProviderMode), providerMode))
            throw new ArgumentException(
                $"Invalid PaymentProviderMode value: {providerMode}.", nameof(providerMode));

        // Reuses the structural validation (identifiers, provider, currency, purpose, positive amount) of the
        // legacy factory, then overwrites the legacy snapshot with the surcharge-aware one.
        var session = Create(
            id,
            orderId,
            orderNumber,
            provider,
            providerSessionId,
            providerCheckoutUrl,
            chargedAmount,
            currency,
            purpose);

        session.BaseAmount                     = baseAmount;
        session.SurchargeAmount                = surchargeAmount;
        session.SurchargePercentageBasisPoints = surchargePercentageBasisPoints;
        session.SurchargeFixedAmount           = surchargeFixedAmount;
        session.SurchargeCalculationVersion    = StripeSurchargeCalculator.CurrentCalculationVersion;
        session.ProviderMode                   = providerMode;

        return session;
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

    /// <summary>Rejects any money value that is not exactly NZD-cent aligned (decimal arithmetic only).</summary>
    private static void RequireCentAligned(decimal value, string parameterName)
    {
        if (value != decimal.Round(value, 2, MidpointRounding.ToEven))
            throw new ArgumentException(
                $"{parameterName} must be exactly cent-aligned.", parameterName);
    }
}
