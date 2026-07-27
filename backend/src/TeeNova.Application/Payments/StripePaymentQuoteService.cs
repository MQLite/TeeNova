using System;
using System.Threading;
using System.Threading.Tasks;
using TeeNova.Payments.Dtos;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Payments;

/// <summary>
/// Builds the authoritative Stripe payment quote from one exact provider/mode settings row and the frozen
/// Phase 1 calculator (Phase 3).
///
/// Ordering is deliberate and fail-closed:
/// resolve settings (single mode row, no Test↔Live fallback) → validate currency → convert the trusted
/// commercial base and the persisted fixed fee to integer cents → run <see cref="StripeSurchargeCalculator"/>
/// → build the immutable snapshot → derive the deterministic fingerprint. Nothing here trusts a client value,
/// performs I/O against Stripe, or writes any record.
/// </summary>
public class StripePaymentQuoteService : IStripePaymentQuoteService, ITransientDependency
{
    private readonly IStripePaymentSettingsResolver _settingsResolver;

    public StripePaymentQuoteService(IStripePaymentSettingsResolver settingsResolver)
    {
        _settingsResolver = settingsResolver;
    }

    public async Task<StripePaymentQuoteSnapshot> ResolveQuoteAsync(
        decimal           trustedBaseAmount,
        PaymentPurpose    purpose,
        CancellationToken cancellationToken = default)
        => (await ResolveCheckoutAsync(trustedBaseAmount, purpose, cancellationToken)).Quote;

    public async Task<StripeResolvedCheckoutQuote> ResolveCheckoutAsync(
        decimal           trustedBaseAmount,
        PaymentPurpose    purpose,
        CancellationToken cancellationToken = default)
    {
        // One internally consistent snapshot from a single (Stripe, active mode) row. Throws fail-closed on
        // missing/disabled settings, undecryptable secrets, or an invalid ENABLED surcharge configuration.
        var settings = await _settingsResolver.ResolveForCheckoutAsync(cancellationToken);

        var quote = BuildQuote(settings, trustedBaseAmount, purpose);

        return new StripeResolvedCheckoutQuote(settings, quote);
    }

    /// <summary>
    /// Pure snapshot construction from already-resolved settings. Kept internal (not private) so the exact
    /// runtime rules can be unit-tested without a settings resolver or any I/O.
    /// </summary>
    internal static StripePaymentQuoteSnapshot BuildQuote(
        ResolvedStripePaymentSettings settings,
        decimal                       trustedBaseAmount,
        PaymentPurpose                purpose)
    {
        if (!Enum.IsDefined(typeof(PaymentPurpose), purpose))
            throw new BusinessException("TeeNova:Payment:OnlinePaymentInvalidPurpose")
                .WithData("RequestedPurpose", purpose);

        if (trustedBaseAmount <= 0m)
            throw new BusinessException("TeeNova:Payment:OnlinePaymentNoAmountDue")
                .WithData("Amount", trustedBaseAmount);

        // An ENABLED surcharge is only defined for NZD under stripe-gross-up-v1. A DISABLED configuration
        // keeps the pre-surcharge behaviour for any currency the shop is already using.
        if (settings.SurchargeEnabled)
        {
            StripeMoney.EnsureSupportedCurrency(settings.Currency, "StripeSurchargeQuote");

            if (!settings.SurchargeConfigurationValid)
                throw new BusinessException("TeeNova:Payment:StripeSurchargeConfigurationInvalid")
                    .WithData("Mode", settings.Mode);

            if (!string.Equals(
                    settings.SurchargeCalculationVersion?.Trim(),
                    StripeSurchargeCalculator.CurrentCalculationVersion,
                    StringComparison.Ordinal))
            {
                throw new BusinessException("TeeNova:Payment:StripeSurchargeConfigurationInvalid")
                    .WithData("ReasonCode", "SurchargeCalculationVersionUnsupported");
            }
        }

        // Runtime revalidation of values that write-time validation should already guarantee: the commercial
        // base and the persisted fixed fee must both be exactly cent-aligned before they reach the calculator.
        var baseCents  = StripeMoney.ToCents(trustedBaseAmount, "baseAmount");
        var fixedCents = StripeMoney.ToCents(settings.SurchargeFixedAmount, "surchargeFixedAmount");

        var calculation = StripeSurchargeCalculator.Calculate(
            baseCents,
            settings.SurchargePercentageBasisPoints,
            fixedCents,
            settings.SurchargeEnabled);

        var currency = (settings.Currency ?? StripeMoney.SupportedCurrency).Trim().ToUpperInvariant();

        // Disclosure text is only meaningful (and only shown) while the surcharge is enabled, but it is
        // always part of the canonical fingerprint input so an edit invalidates outstanding quotes.
        var disclosureText = settings.SurchargeDisclosureText ?? string.Empty;

        var fingerprint = StripePaymentQuoteFingerprint.Compute(
            settings.Provider,
            settings.Mode,
            currency,
            purpose,
            calculation.BaseAmountCents,
            calculation.SurchargeAmountCents,
            calculation.ChargedAmountCents,
            settings.SurchargeEnabled,
            settings.SurchargePercentageBasisPoints,
            fixedCents,
            calculation.CalculationVersion,
            disclosureText);

        return new StripePaymentQuoteSnapshot(
            settings.Provider,
            settings.Mode,
            currency,
            purpose,
            calculation.BaseAmountCents,
            calculation.SurchargeAmountCents,
            calculation.ChargedAmountCents,
            settings.SurchargeEnabled,
            settings.SurchargePercentageBasisPoints,
            fixedCents,
            calculation.CalculationVersion,
            disclosureText,
            fingerprint);
    }

    public OnlinePaymentQuoteDto ToDto(StripePaymentQuoteSnapshot snapshot)
    {
        Check.NotNull(snapshot, nameof(snapshot));

        return new OnlinePaymentQuoteDto
        {
            Provider         = snapshot.Provider,
            Currency         = snapshot.Currency,
            Purpose          = snapshot.Purpose,
            BaseAmount       = snapshot.BaseAmount,
            SurchargeEnabled = snapshot.SurchargeEnabled,
            SurchargeAmount  = snapshot.SurchargeAmount,
            ChargedAmount    = snapshot.ChargedAmount,

            // Never imply a fee when none applies.
            SurchargeDisclosureText        = snapshot.SurchargeEnabled ? snapshot.DisclosureText : null,
            SurchargePercentageBasisPoints = snapshot.SurchargeEnabled ? snapshot.SurchargePercentageBasisPoints : 0,
            SurchargeFixedAmount           = snapshot.SurchargeEnabled ? snapshot.SurchargeFixedAmount : 0m,

            CalculationVersion = snapshot.SurchargeCalculationVersion,
            QuoteFingerprint   = snapshot.QuoteFingerprint,
        };
    }

    /// <summary>
    /// Safe quote contract for a provider that has no surcharge model (Phase 3 adds fees for Stripe only):
    /// charged equals base, no surcharge, and NO fingerprint is issued — session creation never requires one
    /// for these providers.
    /// </summary>
    public static OnlinePaymentQuoteDto BuildUnsurchargedQuote(
        PaymentProvider provider,
        string          currency,
        PaymentPurpose  purpose,
        decimal         baseAmount)
        => new()
        {
            Provider                       = provider,
            Currency                       = (currency ?? StripeMoney.SupportedCurrency).Trim().ToUpperInvariant(),
            Purpose                        = purpose,
            BaseAmount                     = baseAmount,
            SurchargeEnabled               = false,
            SurchargeAmount                = 0m,
            ChargedAmount                  = baseAmount,
            SurchargeDisclosureText        = null,
            SurchargePercentageBasisPoints = 0,
            SurchargeFixedAmount           = 0m,
            CalculationVersion             = StripeSurchargeDefaults.LegacyCalculationVersion,
            QuoteFingerprint               = string.Empty,
        };
}
