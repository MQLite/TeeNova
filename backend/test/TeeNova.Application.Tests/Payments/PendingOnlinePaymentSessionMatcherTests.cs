using System;

namespace TeeNova.Payments;

/// <summary>
/// Pending-session reuse must compare the COMPLETE pricing snapshot (Phase 3), so a customer can never be
/// charged under a configuration or disclosure they did not see — and a surcharge is never applied twice.
/// </summary>
public sealed class PendingOnlinePaymentSessionMatcherTests
{
    private const string Currency = "NZD";

    // ── Exact match ───────────────────────────────────────────────────────────

    [Fact]
    public void Exact_full_snapshot_reuses_the_existing_session()
    {
        var quote   = Quote();
        var session = SurchargeSession(quote);

        Assert.True(Match(session, quote));
    }

    [Fact]
    public void Reuse_does_not_add_the_surcharge_twice()
    {
        var quote   = Quote();
        var session = SurchargeSession(quote);

        Assert.True(Match(session, quote));

        // The reused row still charges exactly one surcharge: its amount is unchanged and equals base+fee.
        Assert.Equal(103.04m, session.Amount);
        Assert.Equal(3.04m,   session.SurchargeAmount);
        Assert.Equal(session.BaseAmount + session.SurchargeAmount, session.Amount);
    }

    [Fact]
    public void Legacy_session_is_reused_when_the_surcharge_is_disabled()
    {
        var quote = Quote(enabled: false, baseAmount: 100.00m);

        Assert.True(Match(LegacySession(100.00m), quote, baseAmount: 100.00m));
    }

    [Fact]
    public void Non_stripe_attempt_with_no_quote_reuses_a_matching_legacy_session()
    {
        var session = LegacySession(50.00m, PaymentProvider.Windcave);

        Assert.True(PendingOnlinePaymentSessionMatcher.Matches(
            session, PaymentProvider.Windcave, PaymentPurpose.FullPayment, Currency, 50.00m, quote: null));
    }

    // ── Supersession ──────────────────────────────────────────────────────────

    [Fact]
    public void Base_change_supersedes()
        => Assert.False(Match(SurchargeSession(Quote(baseAmount: 100.00m)), Quote(baseAmount: 120.00m),
            baseAmount: 120.00m));

    [Fact]
    public void Rate_change_supersedes()
        => Assert.False(Match(SurchargeSession(Quote(basisPoints: 265)), Quote(basisPoints: 300)));

    [Fact]
    public void Fixed_fee_change_supersedes()
        => Assert.False(Match(SurchargeSession(Quote(fixedAmount: 0.30m)), Quote(fixedAmount: 0.50m)));

    [Fact]
    public void Mode_change_supersedes()
        => Assert.False(Match(
            SurchargeSession(Quote(mode: PaymentProviderMode.Test)),
            Quote(mode: PaymentProviderMode.Live)));

    [Fact]
    public void Calculation_version_change_supersedes()
    {
        var quote   = Quote();
        var session = SurchargeSession(quote);

        // Simulate a session stamped with a version the current contract no longer matches.
        SetPrivate(session, nameof(OnlinePaymentSession.SurchargeCalculationVersion), "stripe-gross-up-v0");

        Assert.False(Match(session, quote));
    }

    [Fact]
    public void Enabled_to_disabled_supersedes()
    {
        var session = SurchargeSession(Quote(enabled: true));

        Assert.False(Match(session, Quote(enabled: false), baseAmount: 100.00m));
    }

    [Fact]
    public void Disabled_to_enabled_supersedes()
        => Assert.False(Match(LegacySession(100.00m), Quote(enabled: true)));

    [Fact]
    public void Same_charged_total_with_a_different_configuration_does_not_reuse()
    {
        // 265bp + $0.30 on $100.00 charges 103.04. A different rate/fee pair contrived to charge the same
        // total must still supersede, because the disclosure the customer saw is different.
        var session = SurchargeSession(Quote(basisPoints: 265, fixedAmount: 0.30m));

        var equalTotalDifferentConfig = ManualQuote(
            baseCents: 10_000, surchargeCents: 304, chargedCents: 10_304,
            basisPoints: 200, fixedCents: 95);

        Assert.Equal(session.Amount, equalTotalDifferentConfig.ChargedAmount);
        Assert.False(Match(session, equalTotalDifferentConfig));
    }

    [Fact]
    public void Different_purpose_or_provider_or_currency_never_reuses()
    {
        var quote   = Quote();
        var session = SurchargeSession(quote);

        Assert.False(PendingOnlinePaymentSessionMatcher.Matches(
            session, PaymentProvider.Stripe, PaymentPurpose.Deposit, Currency, 100.00m, quote));
        Assert.False(PendingOnlinePaymentSessionMatcher.Matches(
            session, PaymentProvider.PayPal, PaymentPurpose.FullPayment, Currency, 100.00m, quote));
        Assert.False(PendingOnlinePaymentSessionMatcher.Matches(
            session, PaymentProvider.Stripe, PaymentPurpose.FullPayment, "AUD", 100.00m, quote));
    }

    [Fact]
    public void A_non_pending_session_is_never_reused()
    {
        var quote   = Quote();
        var session = SurchargeSession(quote);
        session.MarkCancelled();

        Assert.False(Match(session, quote));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool Match(
        OnlinePaymentSession session, StripePaymentQuoteSnapshot quote, decimal baseAmount = 100.00m)
        => PendingOnlinePaymentSessionMatcher.Matches(
            session, PaymentProvider.Stripe, PaymentPurpose.FullPayment, Currency, baseAmount, quote);

    private static StripePaymentQuoteSnapshot Quote(
        bool                enabled     = true,
        int                 basisPoints = 265,
        decimal             fixedAmount = 0.30m,
        PaymentProviderMode mode        = PaymentProviderMode.Test,
        decimal             baseAmount  = 100.00m)
        => StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(
                enabled: enabled, basisPoints: basisPoints, fixedAmount: fixedAmount, mode: mode),
            baseAmount);

    /// <summary>Builds a snapshot with hand-picked values, for the "same total, different config" case.</summary>
    private static StripePaymentQuoteSnapshot ManualQuote(
        long baseCents, long surchargeCents, long chargedCents, int basisPoints, long fixedCents)
    {
        var version = StripeSurchargeDefaults.CalculationVersion;

        var fingerprint = StripePaymentQuoteFingerprint.Compute(
            PaymentProvider.Stripe, PaymentProviderMode.Test, Currency, PaymentPurpose.FullPayment,
            baseCents, surchargeCents, chargedCents, true, basisPoints, fixedCents, version,
            StripeSurchargeDefaults.DisclosureText);

        return new StripePaymentQuoteSnapshot(
            PaymentProvider.Stripe, PaymentProviderMode.Test, Currency, PaymentPurpose.FullPayment,
            baseCents, surchargeCents, chargedCents,
            surchargeEnabled: true, basisPoints, fixedCents, version,
            StripeSurchargeDefaults.DisclosureText, fingerprint);
    }

    private static OnlinePaymentSession SurchargeSession(StripePaymentQuoteSnapshot quote)
        => OnlinePaymentSession.CreateWithPaymentSnapshot(
            Guid.NewGuid(), Guid.NewGuid(), "ORD-1", PaymentProvider.Stripe,
            "cs_test_1", "https://checkout.stripe.test/c/1", Currency, quote.Purpose,
            quote.BaseAmount, quote.SurchargeAmount, quote.ChargedAmount,
            quote.SurchargePercentageBasisPoints, quote.SurchargeFixedAmount,
            quote.SurchargeCalculationVersion, quote.ProviderMode);

    private static OnlinePaymentSession LegacySession(
        decimal amount, PaymentProvider provider = PaymentProvider.Stripe)
        => OnlinePaymentSession.Create(
            Guid.NewGuid(), Guid.NewGuid(), "ORD-1", provider,
            "cs_test_legacy", "https://checkout.stripe.test/c/legacy",
            amount, Currency, PaymentPurpose.FullPayment);

    private static void SetPrivate(OnlinePaymentSession session, string property, object value)
        => typeof(OnlinePaymentSession)
            .GetProperty(property)!
            .GetSetMethod(nonPublic: true)!
            .Invoke(session, new[] { value });
}
