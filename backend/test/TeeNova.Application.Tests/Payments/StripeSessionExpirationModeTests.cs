using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using TeeNova.Payments.Dtos;
using TeeNova.Payments.Stripe;

namespace TeeNova.Payments;

/// <summary>
/// Provider-mode-aware expiration (Phase 3): a stale session must be expired with the credentials of the
/// mode it was CREATED under, never whichever mode happens to be active, and never via a cross-mode
/// fallback. Legacy (mode-null) sessions keep the pre-Phase-3 behaviour. Every case here resolves no usable
/// key, so the provider returns before any Stripe call.
/// </summary>
public sealed class StripeSessionExpirationModeTests
{
    [Theory]
    [InlineData(PaymentProviderMode.Test)]
    [InlineData(PaymentProviderMode.Live)]
    public async Task Expiration_resolves_the_key_for_the_stored_mode(PaymentProviderMode storedMode)
    {
        var resolver = new RecordingResolver();
        var provider = Build(resolver);

        await provider.ExpireSessionAsync("cs_test_stale", storedMode);

        Assert.Equal(new[] { storedMode }, resolver.RequestedModes);
        Assert.False(resolver.ActiveModeKeyRequested);
    }

    [Fact]
    public async Task Legacy_mode_null_expiration_uses_the_pre_phase_3_active_mode_path()
    {
        var resolver = new RecordingResolver();
        var provider = Build(resolver);

        await provider.ExpireSessionAsync("cs_test_legacy", providerMode: null);

        Assert.Empty(resolver.RequestedModes);
        Assert.True(resolver.ActiveModeKeyRequested);
    }

    [Fact]
    public async Task Expiration_never_falls_back_to_the_other_mode()
    {
        var resolver = new RecordingResolver();
        var provider = Build(resolver);

        await provider.ExpireSessionAsync("cs_live_stale", PaymentProviderMode.Live);

        Assert.DoesNotContain(PaymentProviderMode.Test, resolver.RequestedModes);
    }

    [Fact]
    public async Task An_unusable_key_makes_expiration_a_safe_no_op()
    {
        var provider = Build(new RecordingResolver());

        // Best effort: no exception escapes even though no credential could be resolved.
        await provider.ExpireSessionAsync("cs_test_stale", PaymentProviderMode.Test);
    }

    [Fact]
    public async Task An_empty_session_id_is_ignored()
    {
        var resolver = new RecordingResolver();
        var provider = Build(resolver);

        await provider.ExpireSessionAsync("   ", PaymentProviderMode.Test);

        Assert.Empty(resolver.RequestedModes);
        Assert.False(resolver.ActiveModeKeyRequested);
    }

    private static StripeOnlinePaymentProvider Build(IStripePaymentSettingsResolver resolver)
        => new(resolver, new UnusedQuoteService(), NullLogger<StripeOnlinePaymentProvider>.Instance);

    private sealed class RecordingResolver : IStripePaymentSettingsResolver
    {
        public List<PaymentProviderMode> RequestedModes        { get; } = new();
        public bool                      ActiveModeKeyRequested { get; private set; }

        public Task<ResolvedStripePaymentSettings> ResolveForCheckoutAsync(CancellationToken ct = default)
            => throw new InvalidOperationException("Expiration must not resolve full checkout settings.");

        public Task<string> ResolveSecretKeyForCheckoutAsync(CancellationToken ct = default)
        {
            ActiveModeKeyRequested = true;
            return Task.FromResult(string.Empty); // no usable key → safe no-op, no Stripe call
        }

        public Task<string?> TryResolveSecretKeyForModeAsync(PaymentProviderMode mode, CancellationToken ct = default)
        {
            RequestedModes.Add(mode);
            return Task.FromResult<string?>(null);
        }

        public Task<string?> TryResolveWebhookSecretAsync(CancellationToken ct = default)
            => Task.FromResult<string?>(null);
    }

    private sealed class UnusedQuoteService : IStripePaymentQuoteService
    {
        public Task<StripePaymentQuoteSnapshot> ResolveQuoteAsync(
            decimal baseAmount, PaymentPurpose purpose, CancellationToken ct = default)
            => throw new InvalidOperationException("Expiration must not resolve a quote.");

        public Task<StripeResolvedCheckoutQuote> ResolveCheckoutAsync(
            decimal baseAmount, PaymentPurpose purpose, CancellationToken ct = default)
            => throw new InvalidOperationException("Expiration must not resolve a quote.");

        public OnlinePaymentQuoteDto ToDto(StripePaymentQuoteSnapshot snapshot)
            => throw new InvalidOperationException("Expiration must not project a quote.");
    }
}
