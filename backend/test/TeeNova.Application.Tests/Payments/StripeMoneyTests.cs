using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// The decimal ↔ cents boundary (Phase 3). Every crossing must be exact or fail closed — no silent rounding,
/// no binary floating point, no tolerance.
/// </summary>
public sealed class StripeMoneyTests
{
    [Theory]
    [InlineData(100.00, 10_000)]
    [InlineData(103.04, 10_304)]
    [InlineData(0.30, 30)]
    [InlineData(0.01, 1)]
    [InlineData(0, 0)]
    [InlineData(9_999.99, 999_999)]
    public void Cent_aligned_amounts_convert_exactly(decimal amount, long expectedCents)
    {
        Assert.Equal(expectedCents, StripeMoney.ToCents(amount, "amount"));
        Assert.Equal(amount, StripeMoney.FromCents(expectedCents));
    }

    [Theory]
    [InlineData(100.001)]
    [InlineData(0.005)]
    [InlineData(103.0449)]
    public void Fractional_cent_amounts_are_rejected(decimal amount)
    {
        var ex = Assert.Throws<BusinessException>(() => StripeMoney.ToCents(amount, "baseAmount"));
        Assert.Equal("TeeNova:Payment:StripeAmountPrecisionInvalid", ex.Code);
    }

    [Fact]
    public void Negative_amounts_are_rejected()
    {
        var ex = Assert.Throws<BusinessException>(() => StripeMoney.ToCents(-1.00m, "baseAmount"));
        Assert.Equal("TeeNova:Payment:StripeAmountNegative", ex.Code);
    }

    [Fact]
    public void Out_of_range_amounts_are_rejected()
    {
        var ex = Assert.Throws<BusinessException>(() => StripeMoney.ToCents(50_000_000m, "baseAmount"));
        Assert.Equal("TeeNova:Payment:StripeAmountOutOfRange", ex.Code);
    }

    [Theory]
    [InlineData("NZD")]
    [InlineData("nzd")]
    [InlineData(" NZD ")]
    public void Nzd_is_the_supported_currency(string currency)
    {
        Assert.True(StripeMoney.IsSupportedCurrency(currency));
        StripeMoney.EnsureSupportedCurrency(currency, "test");
    }

    [Theory]
    [InlineData("AUD")]
    [InlineData("USD")]
    [InlineData("")]
    [InlineData(null)]
    public void Non_nzd_currencies_fail_closed(string? currency)
    {
        Assert.False(StripeMoney.IsSupportedCurrency(currency));

        var ex = Assert.Throws<BusinessException>(
            () => StripeMoney.EnsureSupportedCurrency(currency, "test"));
        Assert.Equal("TeeNova:Payment:StripeCurrencyUnsupported", ex.Code);
    }

    [Theory]
    [InlineData(100.00, true)]
    [InlineData(100.004, false)]
    [InlineData(0.30, true)]
    public void Cent_alignment_is_reported_exactly(decimal amount, bool expected)
        => Assert.Equal(expected, StripeMoney.IsCentAligned(amount));
}
