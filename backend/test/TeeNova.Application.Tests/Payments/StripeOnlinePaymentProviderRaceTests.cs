using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using TeeNova.Payments.Dtos;
using TeeNova.Payments.Stripe;
using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// Settings/mode race detection in the Stripe provider (Phase 3): if the persisted configuration changed
/// after the quote was calculated, the request must fail BEFORE any Stripe API call. The fakes here throw if
/// the resolver's secret-key path is used, so a passing test proves no credential was fetched for a call.
/// </summary>
public sealed class StripeOnlinePaymentProviderRaceTests
{
    [Fact]
    public async Task A_changed_surcharge_configuration_aborts_before_the_stripe_call()
    {
        // Quoted at 265bp; the admin then raises the rate to 400bp.
        var quoted  = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, basisPoints: 265), 100.00m);
        var current = StripePaymentQuoteServiceTests.Settings(enabled: true, basisPoints: 400);

        var provider = BuildProvider(current);

        var ex = await Assert.ThrowsAsync<BusinessException>(
            () => provider.CreatePaymentSessionAsync(Request(quoted)));

        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }

    [Fact]
    public async Task A_changed_active_mode_aborts_before_the_stripe_call()
    {
        var quoted = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, mode: PaymentProviderMode.Test), 100.00m);

        var provider = BuildProvider(
            StripePaymentQuoteServiceTests.Settings(enabled: true, mode: PaymentProviderMode.Live));

        var ex = await Assert.ThrowsAsync<BusinessException>(
            () => provider.CreatePaymentSessionAsync(Request(quoted)));

        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }

    [Fact]
    public async Task Enabling_the_surcharge_after_a_disabled_quote_aborts_before_the_stripe_call()
    {
        var quoted = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: false), 100.00m);

        var provider = BuildProvider(StripePaymentQuoteServiceTests.Settings(enabled: true));

        var request = Request(quoted);
        request.SurchargeEnabled = false;
        request.Amount           = 100.00m;
        request.BaseAmount       = 100.00m;
        request.SurchargeAmount  = 0m;
        request.ProviderMode     = null;

        var ex = await Assert.ThrowsAsync<BusinessException>(
            () => provider.CreatePaymentSessionAsync(request));

        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }

    [Fact]
    public async Task A_disclosure_change_aborts_before_the_stripe_call()
    {
        var quoted = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, disclosure: "Old disclosure."), 100.00m);

        var provider = BuildProvider(
            StripePaymentQuoteServiceTests.Settings(enabled: true, disclosure: "New disclosure."));

        var ex = await Assert.ThrowsAsync<BusinessException>(
            () => provider.CreatePaymentSessionAsync(Request(quoted)));

        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }

    [Fact]
    public async Task A_request_for_another_provider_is_rejected_outright()
    {
        var provider = BuildProvider(StripePaymentQuoteServiceTests.Settings(enabled: true));
        var request  = Request(StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true), 100.00m));
        request.Provider = PaymentProvider.PayPal;

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => provider.CreatePaymentSessionAsync(request));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static StripeOnlinePaymentProvider BuildProvider(ResolvedStripePaymentSettings currentSettings)
        => new(
            new ThrowingSecretResolver(),
            new FixedQuoteService(currentSettings),
            NullLogger<StripeOnlinePaymentProvider>.Instance);

    private static CreateOnlinePaymentProviderSessionRequest Request(StripePaymentQuoteSnapshot quote) => new()
    {
        OrderId                        = Guid.NewGuid(),
        OrderNumber                    = "ORD-2001",
        Provider                       = PaymentProvider.Stripe,
        Purpose                        = quote.Purpose,
        Amount                         = quote.ChargedAmount,
        Currency                       = quote.Currency,
        CustomerEmail                  = "customer@example.test",
        SuccessUrl                     = "https://example.test/checkout/success",
        CancelUrl                      = "https://example.test/checkout/cancel",
        PaymentSessionId               = Guid.NewGuid(),
        BaseAmount                     = quote.BaseAmount,
        SurchargeAmount                = quote.SurchargeAmount,
        SurchargeEnabled               = quote.SurchargeEnabled,
        SurchargePercentageBasisPoints = quote.SurchargePercentageBasisPoints,
        SurchargeFixedAmount           = quote.SurchargeFixedAmount,
        SurchargeCalculationVersion    = quote.SurchargeCalculationVersion,
        ProviderMode                   = quote.SurchargeEnabled ? quote.ProviderMode : null,
        PaymentQuoteFingerprint        = quote.QuoteFingerprint,
    };

    /// <summary>Fails the test if the provider ever tries to fetch a key outside the verified quote path.</summary>
    private sealed class ThrowingSecretResolver : IStripePaymentSettingsResolver
    {
        public Task<ResolvedStripePaymentSettings> ResolveForCheckoutAsync(CancellationToken ct = default)
            => throw new InvalidOperationException("Settings must be resolved through the quote service.");

        public Task<string> ResolveSecretKeyForCheckoutAsync(CancellationToken ct = default)
            => throw new InvalidOperationException("The legacy secret path must not be used for a quoted request.");

        public Task<string?> TryResolveSecretKeyForModeAsync(PaymentProviderMode mode, CancellationToken ct = default)
            => Task.FromResult<string?>(null);

        public Task<string?> TryResolveWebhookSecretAsync(CancellationToken ct = default)
            => Task.FromResult<string?>(null);
    }

    private sealed class FixedQuoteService : IStripePaymentQuoteService
    {
        private readonly ResolvedStripePaymentSettings _settings;
        private readonly StripePaymentQuoteService     _inner;

        public FixedQuoteService(ResolvedStripePaymentSettings settings)
        {
            _settings = settings;
            _inner    = new StripePaymentQuoteService(new StaticResolver(settings));
        }

        public Task<StripePaymentQuoteSnapshot> ResolveQuoteAsync(
            decimal baseAmount, PaymentPurpose purpose, CancellationToken ct = default)
            => _inner.ResolveQuoteAsync(baseAmount, purpose, ct);

        public Task<StripeResolvedCheckoutQuote> ResolveCheckoutAsync(
            decimal baseAmount, PaymentPurpose purpose, CancellationToken ct = default)
            => _inner.ResolveCheckoutAsync(baseAmount, purpose, ct);

        public OnlinePaymentQuoteDto ToDto(StripePaymentQuoteSnapshot snapshot) => _inner.ToDto(snapshot);

        private sealed class StaticResolver : IStripePaymentSettingsResolver
        {
            private readonly ResolvedStripePaymentSettings _settings;
            public StaticResolver(ResolvedStripePaymentSettings settings) => _settings = settings;

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
}
