using System;

namespace TeeNova.Payments;

/// <summary>
/// The quote fingerprint must be stable for identical trusted inputs and must change whenever ANY
/// customer-relevant quoted value changes — including the disclosure text and the Test/Live mode.
/// </summary>
public sealed class StripePaymentQuoteFingerprintTests
{
    [Fact]
    public void Same_trusted_inputs_produce_the_same_fingerprint()
    {
        var settings = StripePaymentQuoteServiceTests.Settings(enabled: true);

        var first  = StripePaymentQuoteServiceTests.Build(settings, 100.00m);
        var second = StripePaymentQuoteServiceTests.Build(settings, 100.00m);

        Assert.Equal(first.QuoteFingerprint, second.QuoteFingerprint);
        Assert.False(string.IsNullOrWhiteSpace(first.QuoteFingerprint));
    }

    [Fact]
    public void Fingerprint_is_lowercase_sha256_hex()
    {
        var fingerprint = StripePaymentQuoteServiceTests
            .Build(StripePaymentQuoteServiceTests.Settings(enabled: true), 100.00m)
            .QuoteFingerprint;

        Assert.Equal(64, fingerprint.Length);
        Assert.All(fingerprint, c => Assert.True(char.IsDigit(c) || (c >= 'a' && c <= 'f')));
    }

    [Fact]
    public void Base_amount_change_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(StripePaymentQuoteServiceTests.Settings(), 100.00m),
            StripePaymentQuoteServiceTests.Build(StripePaymentQuoteServiceTests.Settings(), 100.01m));

    [Fact]
    public void Purpose_change_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(), 100.00m, PaymentPurpose.FullPayment),
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(), 100.00m, PaymentPurpose.Deposit));

    [Fact]
    public void Rate_change_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(basisPoints: 265), 100.00m),
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(basisPoints: 300), 100.00m));

    [Fact]
    public void Fixed_fee_change_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(fixedAmount: 0.30m), 100.00m),
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(fixedAmount: 0.50m), 100.00m));

    [Fact]
    public void Disclosure_change_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(disclosure: "Original disclosure."), 100.00m),
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(disclosure: "Updated disclosure."), 100.00m));

    [Fact]
    public void Mode_change_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(mode: PaymentProviderMode.Test), 100.00m),
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(mode: PaymentProviderMode.Live), 100.00m));

    [Fact]
    public void Enabling_or_disabling_the_surcharge_changes_the_fingerprint()
        => AssertDifferent(
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(enabled: false), 100.00m),
            StripePaymentQuoteServiceTests.Build(
                StripePaymentQuoteServiceTests.Settings(enabled: true), 100.00m));

    [Fact]
    public void Calculation_version_change_changes_the_fingerprint()
    {
        // The service refuses an unsupported persisted version, so the version's contribution to the
        // canonical form is asserted directly against the hash function.
        var baseline = Compute(version: StripeSurchargeDefaults.CalculationVersion);
        var other    = Compute(version: "stripe-gross-up-v2");

        Assert.NotEqual(baseline, other);
    }

    [Fact]
    public void A_configuration_change_that_preserves_the_total_still_changes_the_fingerprint()
    {
        // Same charged total, different composition: 265bp + $0.30 vs a rate/fee pair contrived to match.
        var first  = Compute(basisPoints: 265, fixedCents: 30);
        var second = Compute(basisPoints: 300, fixedCents: 30);

        Assert.NotEqual(first, second);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-the-fingerprint")]
    public void Non_matching_values_never_match(string? supplied)
        => Assert.False(StripePaymentQuoteFingerprint.Matches(supplied, Compute()));

    [Fact]
    public void Matching_is_whitespace_and_case_tolerant_on_hex_only()
    {
        var expected = Compute();

        Assert.True(StripePaymentQuoteFingerprint.Matches($"  {expected.ToUpperInvariant()} ", expected));
        Assert.False(StripePaymentQuoteFingerprint.Matches(expected, string.Empty));
    }

    private static void AssertDifferent(StripePaymentQuoteSnapshot a, StripePaymentQuoteSnapshot b)
        => Assert.NotEqual(a.QuoteFingerprint, b.QuoteFingerprint);

    private static string Compute(
        int    basisPoints = 265,
        long   fixedCents  = 30,
        string version     = StripeSurchargeDefaults.CalculationVersion,
        string disclosure  = StripeSurchargeDefaults.DisclosureText)
        => StripePaymentQuoteFingerprint.Compute(
            PaymentProvider.Stripe,
            PaymentProviderMode.Test,
            "NZD",
            PaymentPurpose.FullPayment,
            baseAmountCents: 10_000,
            surchargeAmountCents: 304,
            chargedAmountCents: 10_304,
            surchargeEnabled: true,
            surchargePercentageBasisPoints: basisPoints,
            surchargeFixedAmountCents: fixedCents,
            calculationVersion: version,
            disclosureText: disclosure);
}
