using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// Compatibility gate for the not-yet-updated frontend (Phase 3): a disabled surcharge keeps working without
/// a fingerprint, while an enabled surcharge can never be charged without a CURRENT one.
/// </summary>
public sealed class StripePaymentQuoteGateTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("stale-value")]
    public void Disabled_surcharge_never_requires_a_fingerprint(string? supplied)
    {
        var quote = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: false), 100.00m);

        StripePaymentQuoteGate.Ensure(quote, supplied); // must not throw
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("    ")]
    public void Enabled_surcharge_without_a_fingerprint_is_quote_required(string? supplied)
    {
        var quote = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true), 100.00m);

        var ex = Assert.Throws<BusinessException>(() => StripePaymentQuoteGate.Ensure(quote, supplied));
        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteRequired", ex.Code);
    }

    [Fact]
    public void Enabled_surcharge_with_a_stale_fingerprint_is_quote_stale()
    {
        var displayed = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, basisPoints: 265), 100.00m);

        // The admin raises the rate after the customer saw the disclosure.
        var current = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, basisPoints: 400), 100.00m);

        var ex = Assert.Throws<BusinessException>(
            () => StripePaymentQuoteGate.Ensure(current, displayed.QuoteFingerprint));
        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }

    [Fact]
    public void Enabled_surcharge_with_the_current_fingerprint_passes()
    {
        var quote = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true), 100.00m);

        StripePaymentQuoteGate.Ensure(quote, quote.QuoteFingerprint); // must not throw
    }

    [Fact]
    public void A_fingerprint_from_a_different_mode_is_stale()
    {
        var testQuote = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, mode: PaymentProviderMode.Test), 100.00m);
        var liveQuote = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true, mode: PaymentProviderMode.Live), 100.00m);

        var ex = Assert.Throws<BusinessException>(
            () => StripePaymentQuoteGate.Ensure(liveQuote, testQuote.QuoteFingerprint));
        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }

    [Fact]
    public void A_fingerprint_for_a_different_commercial_base_is_stale()
    {
        var settings = StripePaymentQuoteServiceTests.Settings(enabled: true);

        var quotedAt100 = StripePaymentQuoteServiceTests.Build(settings, 100.00m);
        var currentAt80 = StripePaymentQuoteServiceTests.Build(settings, 80.00m);

        var ex = Assert.Throws<BusinessException>(
            () => StripePaymentQuoteGate.Ensure(currentAt80, quotedAt100.QuoteFingerprint));
        Assert.Equal("TeeNova:Payment:StripeSurchargeQuoteStale", ex.Code);
    }
}
