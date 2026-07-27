using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using TeeNova.Payments.Dtos;
using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// Runtime quote resolution (Phase 3): the frozen Phase 1 calculation applied to trusted commercial amounts
/// and persisted Test/Live settings, the safe DTO projection, and the deterministic fingerprint.
/// Pure — no database, no Stripe, no network.
/// </summary>
public sealed class StripePaymentQuoteServiceTests
{
    private const string Version       = StripeSurchargeDefaults.CalculationVersion;
    private const string LegacyVersion = StripeSurchargeDefaults.LegacyCalculationVersion;

    // ── Calculation ───────────────────────────────────────────────────────────

    [Fact]
    public void Disabled_surcharge_quotes_base_equal_to_charged()
    {
        var quote = Build(Settings(enabled: false), 100.00m);

        Assert.False(quote.SurchargeEnabled);
        Assert.Equal(100.00m, quote.BaseAmount);
        Assert.Equal(0m,      quote.SurchargeAmount);
        Assert.Equal(100.00m, quote.ChargedAmount);
    }

    [Fact]
    public void Canonical_nz100_quote_matches_the_frozen_phase_1_result()
    {
        var quote = Build(Settings(enabled: true, basisPoints: 265, fixedAmount: 0.30m), 100.00m);

        Assert.True(quote.SurchargeEnabled);
        Assert.Equal(100.00m, quote.BaseAmount);
        Assert.Equal(3.04m,   quote.SurchargeAmount);
        Assert.Equal(103.04m, quote.ChargedAmount);
        Assert.Equal(10_000,  quote.BaseAmountCents);
        Assert.Equal(304,     quote.SurchargeAmountCents);
        Assert.Equal(10_304,  quote.ChargedAmountCents);
        Assert.Equal(Version, quote.SurchargeCalculationVersion);
    }

    [Fact]
    public void Percentage_only_configuration_is_supported()
    {
        var quote = Build(Settings(enabled: true, basisPoints: 265, fixedAmount: 0m), 100.00m);

        // 10,000 × 10,000 / 9,735 = 10,272.21… → ceiling 10,273 cents.
        Assert.Equal(10_273, quote.ChargedAmountCents);
        Assert.Equal(2.73m,  quote.SurchargeAmount);
    }

    [Fact]
    public void Fixed_fee_only_configuration_is_supported()
    {
        var quote = Build(Settings(enabled: true, basisPoints: 0, fixedAmount: 0.30m), 100.00m);

        Assert.Equal(0.30m,   quote.SurchargeAmount);
        Assert.Equal(100.30m, quote.ChargedAmount);
    }

    [Fact]
    public void Enabled_zero_rate_and_zero_fixed_fee_produce_a_zero_surcharge()
    {
        var quote = Build(Settings(enabled: true, basisPoints: 0, fixedAmount: 0m), 100.00m);

        Assert.True(quote.SurchargeEnabled);
        Assert.Equal(0m,      quote.SurchargeAmount);
        Assert.Equal(100.00m, quote.ChargedAmount);
    }

    // ── Fail-closed inputs ────────────────────────────────────────────────────

    [Fact]
    public void Non_cent_aligned_base_amount_is_rejected()
    {
        var ex = Assert.Throws<BusinessException>(() => Build(Settings(enabled: true), 100.001m));
        Assert.Equal("TeeNova:Payment:StripeAmountPrecisionInvalid", ex.Code);
    }

    [Fact]
    public void Non_cent_aligned_persisted_fixed_amount_is_rejected_at_runtime()
    {
        // Bypasses domain write validation the way corrupted/hand-edited data would.
        var ex = Assert.Throws<BusinessException>(
            () => Build(Settings(enabled: true, fixedAmount: 0.3049m), 100.00m));
        Assert.Equal("TeeNova:Payment:StripeAmountPrecisionInvalid", ex.Code);
    }

    [Fact]
    public void Non_nzd_enabled_configuration_fails_closed()
    {
        var ex = Assert.Throws<BusinessException>(
            () => Build(Settings(enabled: true, currency: "AUD"), 100.00m));
        Assert.Equal("TeeNova:Payment:StripeCurrencyUnsupported", ex.Code);
    }

    [Fact]
    public void Invalid_enabled_persisted_configuration_fails_closed()
    {
        var ex = Assert.Throws<BusinessException>(
            () => Build(Settings(enabled: true, configurationValid: false), 100.00m));
        Assert.Equal("TeeNova:Payment:StripeSurchargeConfigurationInvalid", ex.Code);
    }

    [Fact]
    public void Unsupported_persisted_calculation_version_fails_closed()
    {
        var ex = Assert.Throws<BusinessException>(
            () => Build(Settings(enabled: true, calculationVersion: "stripe-gross-up-v2"), 100.00m));
        Assert.Equal("TeeNova:Payment:StripeSurchargeConfigurationInvalid", ex.Code);
    }

    [Fact]
    public void Zero_or_negative_base_amount_is_rejected()
    {
        Assert.Throws<BusinessException>(() => Build(Settings(enabled: true), 0m));
        Assert.Throws<BusinessException>(() => Build(Settings(enabled: true), -5.00m));
    }

    // ── Safe DTO projection ───────────────────────────────────────────────────

    [Fact]
    public void Safe_dto_exposes_no_secret_and_no_provider_mode()
    {
        var settings = Settings(enabled: true);
        var dto      = new StripePaymentQuoteService(new FakeResolver(settings))
            .ToDto(Build(settings, 100.00m));

        var properties = typeof(OnlinePaymentQuoteDto).GetProperties().Select(p => p.Name).ToArray();

        Assert.DoesNotContain(properties, n => n.Contains("Secret", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(properties, n => n.Contains("Cipher", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(properties, n => n.Contains("Key",    StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(properties, n => n.Contains("Mode",   StringComparison.OrdinalIgnoreCase));

        var serialized = System.Text.Json.JsonSerializer.Serialize(dto);
        Assert.DoesNotContain("sk_test", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("whsec",   serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Safe_dto_carries_the_customer_facing_values()
    {
        var settings = Settings(enabled: true);
        var quote    = Build(settings, 100.00m);
        var dto      = new StripePaymentQuoteService(new FakeResolver(settings)).ToDto(quote);

        Assert.Equal(PaymentProvider.Stripe, dto.Provider);
        Assert.Equal("NZD",   dto.Currency);
        Assert.Equal(100.00m, dto.BaseAmount);
        Assert.Equal(3.04m,   dto.SurchargeAmount);
        Assert.Equal(103.04m, dto.ChargedAmount);
        Assert.True(dto.SurchargeEnabled);
        Assert.Equal(StripeSurchargeDefaults.DisclosureText, dto.SurchargeDisclosureText);
        Assert.Equal(265,   dto.SurchargePercentageBasisPoints);
        Assert.Equal(0.30m, dto.SurchargeFixedAmount);
        Assert.Equal(quote.QuoteFingerprint, dto.QuoteFingerprint);
    }

    [Fact]
    public void Disabled_quote_dto_never_implies_a_fee()
    {
        var settings = Settings(enabled: false);
        var dto      = new StripePaymentQuoteService(new FakeResolver(settings)).ToDto(Build(settings, 100.00m));

        Assert.False(dto.SurchargeEnabled);
        Assert.Null(dto.SurchargeDisclosureText);
        Assert.Equal(0,  dto.SurchargePercentageBasisPoints);
        Assert.Equal(0m, dto.SurchargeFixedAmount);
        Assert.Equal(dto.BaseAmount, dto.ChargedAmount);
    }

    [Fact]
    public void Unsurcharged_quote_for_another_provider_issues_no_fingerprint()
    {
        var dto = StripePaymentQuoteService.BuildUnsurchargedQuote(
            PaymentProvider.Windcave, "NZD", PaymentPurpose.FullPayment, 42.50m);

        Assert.False(dto.SurchargeEnabled);
        Assert.Equal(42.50m, dto.BaseAmount);
        Assert.Equal(42.50m, dto.ChargedAmount);
        Assert.Equal(0m,     dto.SurchargeAmount);
        Assert.Equal(string.Empty, dto.QuoteFingerprint);
        Assert.Equal(LegacyVersion, dto.CalculationVersion);
    }

    // ── Resolver plumbing ─────────────────────────────────────────────────────

    [Fact]
    public async Task Resolution_uses_the_settings_returned_by_the_resolver()
    {
        var settings = Settings(enabled: true, mode: PaymentProviderMode.Live);
        var service  = new StripePaymentQuoteService(new FakeResolver(settings));

        var quote = await service.ResolveQuoteAsync(100.00m, PaymentPurpose.FullPayment);

        Assert.Equal(PaymentProviderMode.Live, quote.ProviderMode);
        Assert.Equal(103.04m, quote.ChargedAmount);
    }

    [Fact]
    public async Task Checkout_resolution_returns_the_same_snapshot_as_quote_resolution()
    {
        var settings = Settings(enabled: true);
        var service  = new StripePaymentQuoteService(new FakeResolver(settings));

        var quote    = await service.ResolveQuoteAsync(100.00m, PaymentPurpose.FullPayment);
        var checkout = await service.ResolveCheckoutAsync(100.00m, PaymentPurpose.FullPayment);

        Assert.Equal(quote.QuoteFingerprint, checkout.Quote.QuoteFingerprint);
        Assert.Same(settings, checkout.Settings);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    internal static StripePaymentQuoteSnapshot Build(
        ResolvedStripePaymentSettings settings,
        decimal                       baseAmount,
        PaymentPurpose                purpose = PaymentPurpose.FullPayment)
        => StripePaymentQuoteService.BuildQuote(settings, baseAmount, purpose);

    internal static ResolvedStripePaymentSettings Settings(
        bool                enabled            = true,
        int                 basisPoints        = 265,
        decimal             fixedAmount        = 0.30m,
        string              currency           = "NZD",
        PaymentProviderMode mode               = PaymentProviderMode.Test,
        string?             disclosure         = null,
        string              calculationVersion = StripeSurchargeDefaults.CalculationVersion,
        bool                configurationValid = true)
        => new(
            PaymentProvider.Stripe,
            mode,
            IsEnabled: true,
            currency,
            PublishableKey: "pk_test_visible",
            SecretKey: "sk_test_secret_value",
            WebhookSecret: "whsec_secret_value",
            SuccessReturnBaseUrl: "https://example.test/checkout/success",
            CancelReturnBaseUrl: "https://example.test/checkout/cancel",
            SurchargeEnabled: enabled,
            SurchargePercentageBasisPoints: basisPoints,
            SurchargeFixedAmount: fixedAmount,
            SurchargeDisclosureText: disclosure ?? StripeSurchargeDefaults.DisclosureText,
            SurchargeCalculationVersion: calculationVersion,
            SurchargeConfigurationValid: configurationValid);

    private sealed class FakeResolver : IStripePaymentSettingsResolver
    {
        private readonly ResolvedStripePaymentSettings _settings;

        public FakeResolver(ResolvedStripePaymentSettings settings) => _settings = settings;

        public Task<ResolvedStripePaymentSettings> ResolveForCheckoutAsync(CancellationToken ct = default)
            => Task.FromResult(_settings);

        public Task<string> ResolveSecretKeyForCheckoutAsync(CancellationToken ct = default)
            => Task.FromResult(_settings.SecretKey);

        public Task<string?> TryResolveSecretKeyForModeAsync(PaymentProviderMode mode, CancellationToken ct = default)
            => Task.FromResult<string?>(mode == _settings.Mode ? _settings.SecretKey : null);

        public Task<string?> TryResolveWebhookSecretAsync(CancellationToken ct = default)
            => Task.FromResult<string?>(_settings.WebhookSecret);
    }
}
