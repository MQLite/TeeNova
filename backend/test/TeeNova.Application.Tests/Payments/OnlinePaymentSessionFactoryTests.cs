using System;

namespace TeeNova.Payments;

/// <summary>
/// Local session persistence choice (Phase 3): a surcharge-enabled quote must go through the Phase 2B
/// snapshot factory with every field preserved, everything else must keep using the legacy factory, and no
/// provider-returned value may influence the recorded amounts.
/// </summary>
public sealed class OnlinePaymentSessionFactoryTests
{
    private static readonly Guid SessionId = Guid.NewGuid();
    private static readonly Guid OrderId   = Guid.NewGuid();

    [Fact]
    public void Enabled_quote_persists_the_complete_snapshot()
    {
        var quote   = Quote(enabled: true, mode: PaymentProviderMode.Test);
        var session = Create(quote, commercialBase: 100.00m);

        Assert.Equal(SessionId, session.Id);
        Assert.Equal(quote.BaseAmount,      session.BaseAmount);
        Assert.Equal(quote.SurchargeAmount, session.SurchargeAmount);
        Assert.Equal(quote.ChargedAmount,   session.Amount);
        Assert.Equal(quote.SurchargePercentageBasisPoints, session.SurchargePercentageBasisPoints);
        Assert.Equal(quote.SurchargeFixedAmount,           session.SurchargeFixedAmount);
        Assert.Equal(quote.SurchargeCalculationVersion,    session.SurchargeCalculationVersion);
        Assert.Equal(quote.ProviderMode, session.ProviderMode);

        Assert.Equal(100.00m, session.BaseAmount);
        Assert.Equal(3.04m,   session.SurchargeAmount);
        Assert.Equal(103.04m, session.Amount);
    }

    [Theory]
    [InlineData(PaymentProviderMode.Test)]
    [InlineData(PaymentProviderMode.Live)]
    public void The_persisted_mode_comes_from_the_resolved_settings_row(PaymentProviderMode mode)
        => Assert.Equal(mode, Create(Quote(enabled: true, mode: mode), 100.00m).ProviderMode);

    [Fact]
    public void Disabled_quote_uses_the_legacy_factory()
    {
        var session = Create(Quote(enabled: false), commercialBase: 100.00m);

        Assert.Equal(100.00m, session.Amount);
        Assert.Equal(100.00m, session.BaseAmount);
        Assert.Equal(0m,      session.SurchargeAmount);
        Assert.Equal(0,       session.SurchargePercentageBasisPoints);
        Assert.Equal(0m,      session.SurchargeFixedAmount);
        Assert.Equal(StripeSurchargeDefaults.LegacyCalculationVersion, session.SurchargeCalculationVersion);
        Assert.Null(session.ProviderMode);
    }

    [Fact]
    public void No_quote_at_all_uses_the_legacy_factory()
    {
        var session = Create(quote: null, commercialBase: 75.25m);

        Assert.Equal(75.25m, session.Amount);
        Assert.Equal(75.25m, session.BaseAmount);
        Assert.Equal(StripeSurchargeDefaults.LegacyCalculationVersion, session.SurchargeCalculationVersion);
        Assert.Null(session.ProviderMode);
    }

    [Fact]
    public void The_provider_response_cannot_override_the_local_amount_snapshot()
    {
        var quote = Quote(enabled: true);

        // Only the provider's identifiers are taken from the response; there is no amount parameter at all.
        var session = OnlinePaymentSessionFactory.Create(
            SessionId, OrderId, "ORD-1", PaymentProvider.Stripe,
            "cs_provider_returned_id", "https://checkout.stripe.test/c/provider",
            "NZD", PaymentPurpose.FullPayment, 100.00m, quote);

        Assert.Equal("cs_provider_returned_id", session.ProviderSessionId);
        Assert.Equal(quote.ChargedAmount, session.Amount);
        Assert.Equal(quote.BaseAmount,    session.BaseAmount);
    }

    [Fact]
    public void The_local_session_id_is_the_one_generated_before_the_provider_call()
        => Assert.Equal(SessionId, Create(Quote(enabled: true), 100.00m).Id);

    private static OnlinePaymentSession Create(StripePaymentQuoteSnapshot? quote, decimal commercialBase)
        => OnlinePaymentSessionFactory.Create(
            SessionId, OrderId, "ORD-1", PaymentProvider.Stripe,
            "cs_test_1", "https://checkout.stripe.test/c/1",
            "NZD", PaymentPurpose.FullPayment, commercialBase, quote);

    private static StripePaymentQuoteSnapshot Quote(
        bool enabled, PaymentProviderMode mode = PaymentProviderMode.Test)
        => StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: enabled, mode: mode), 100.00m);
}
