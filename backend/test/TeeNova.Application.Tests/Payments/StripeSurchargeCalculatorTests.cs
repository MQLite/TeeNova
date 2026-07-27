using TeeNova.Payments;

namespace TeeNova.Payments;

public sealed class StripeSurchargeCalculatorTests
{
    [Fact]
    public void Disabled_surcharge_returns_base_and_preserves_configured_inputs()
    {
        var result = StripeSurchargeCalculator.Calculate(
            baseAmountCents: 10_000,
            percentageBasisPoints: 265,
            fixedFeeCents: 30,
            enabled: false);

        Assert.Equal(10_000, result.BaseAmountCents);
        Assert.Equal(0, result.SurchargeAmountCents);
        Assert.Equal(10_000, result.ChargedAmountCents);
        Assert.Equal(265, result.PercentageBasisPoints);
        Assert.Equal(30, result.FixedFeeCents);
        Assert.False(result.Enabled);
    }

    [Fact]
    public void Disabled_surcharge_does_not_evaluate_overflowing_gross_up()
    {
        var result = StripeSurchargeCalculator.Calculate(
            baseAmountCents: long.MaxValue,
            percentageBasisPoints: 9_999,
            fixedFeeCents: long.MaxValue,
            enabled: false);

        Assert.Equal(long.MaxValue, result.BaseAmountCents);
        Assert.Equal(long.MaxValue, result.ChargedAmountCents);
        Assert.Equal(0, result.SurchargeAmountCents);
        Assert.Equal(long.MaxValue, result.FixedFeeCents);
    }

    [Fact]
    public void Enabled_with_zero_percentage_and_fixed_fee_returns_base()
    {
        var result = Calculate(baseAmountCents: 12_345, percentageBasisPoints: 0, fixedFeeCents: 0);

        Assert.Equal(0, result.SurchargeAmountCents);
        Assert.Equal(12_345, result.ChargedAmountCents);
    }

    [Fact]
    public void Percentage_only_fee_is_grossed_up_and_ceiled()
    {
        var result = Calculate(baseAmountCents: 10_000, percentageBasisPoints: 250, fixedFeeCents: 0);

        Assert.Equal(10_257, result.ChargedAmountCents);
        Assert.Equal(257, result.SurchargeAmountCents);
    }

    [Fact]
    public void Fixed_fee_only_is_added_exactly()
    {
        var result = Calculate(baseAmountCents: 10_000, percentageBasisPoints: 0, fixedFeeCents: 30);

        Assert.Equal(10_030, result.ChargedAmountCents);
        Assert.Equal(30, result.SurchargeAmountCents);
    }

    [Fact]
    public void Percentage_and_fixed_fee_use_the_combined_gross_up_formula()
    {
        var result = Calculate(baseAmountCents: 2_500, percentageBasisPoints: 300, fixedFeeCents: 50);

        Assert.Equal(2_629, result.ChargedAmountCents);
        Assert.Equal(129, result.SurchargeAmountCents);
    }

    [Fact]
    public void One_hundred_dollar_example_uses_ceiling_and_returns_10304_cents()
    {
        var result = Calculate(baseAmountCents: 10_000, percentageBasisPoints: 265, fixedFeeCents: 30);

        // 100,300,000 / 9,735 = 10,303 remainder 295, so ceiling adds one cent.
        Assert.Equal(10_304, result.ChargedAmountCents);
        Assert.Equal(304, result.SurchargeAmountCents);
    }

    [Fact]
    public void Exact_division_does_not_add_an_extra_cent()
    {
        var result = Calculate(baseAmountCents: 9_000, percentageBasisPoints: 1_000, fixedFeeCents: 0);

        Assert.Equal(10_000, result.ChargedAmountCents);
        Assert.Equal(1_000, result.SurchargeAmountCents);
    }

    [Fact]
    public void Fractional_cent_result_is_rounded_up_by_exactly_one_cent()
    {
        var result = Calculate(baseAmountCents: 100, percentageBasisPoints: 100, fixedFeeCents: 0);

        Assert.Equal(102, result.ChargedAmountCents);
        Assert.Equal(2, result.SurchargeAmountCents);
    }

    [Fact]
    public void One_cent_base_with_percentage_only_uses_mathematical_result()
    {
        var result = Calculate(baseAmountCents: 1, percentageBasisPoints: 265, fixedFeeCents: 0);

        Assert.Equal(2, result.ChargedAmountCents);
        Assert.Equal(1, result.SurchargeAmountCents);
    }

    [Fact]
    public void One_cent_base_with_percentage_and_fixed_fee_uses_mathematical_result()
    {
        var result = Calculate(baseAmountCents: 1, percentageBasisPoints: 265, fixedFeeCents: 30);

        Assert.Equal(32, result.ChargedAmountCents);
        Assert.Equal(31, result.SurchargeAmountCents);
    }

    [Fact]
    public void Large_valid_amount_has_no_precision_loss()
    {
        var result = Calculate(
            baseAmountCents: 1_000_000_000_000,
            percentageBasisPoints: 333,
            fixedFeeCents: 99);

        Assert.Equal(1_034_447_088_134, result.ChargedAmountCents);
        Assert.Equal(34_447_088_134, result.SurchargeAmountCents);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Non_positive_base_is_rejected(long baseAmountCents)
    {
        var exception = Assert.Throws<ArgumentOutOfRangeException>(
            () => Calculate(baseAmountCents, percentageBasisPoints: 265, fixedFeeCents: 30));

        Assert.Equal(nameof(baseAmountCents), exception.ParamName);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(10_000)]
    [InlineData(10_001)]
    public void Percentage_outside_mathematical_range_is_rejected(int percentageBasisPoints)
    {
        var exception = Assert.Throws<ArgumentOutOfRangeException>(
            () => Calculate(baseAmountCents: 10_000, percentageBasisPoints, fixedFeeCents: 30));

        Assert.Equal(nameof(percentageBasisPoints), exception.ParamName);
    }

    [Fact]
    public void Negative_fixed_fee_is_rejected()
    {
        var exception = Assert.Throws<ArgumentOutOfRangeException>(
            () => Calculate(baseAmountCents: 10_000, percentageBasisPoints: 265, fixedFeeCents: -1));

        Assert.Equal("fixedFeeCents", exception.ParamName);
    }

    [Fact]
    public void Overflow_while_adding_fixed_fee_is_explicit()
    {
        Assert.Throws<OverflowException>(
            () => Calculate(long.MaxValue, percentageBasisPoints: 0, fixedFeeCents: 1));
    }

    [Fact]
    public void Overflow_while_scaling_numerator_is_explicit()
    {
        var baseAmountCents = long.MaxValue / 10_000 + 1;

        Assert.Throws<OverflowException>(
            () => Calculate(baseAmountCents, percentageBasisPoints: 0, fixedFeeCents: 0));
    }

    [Fact]
    public void Identical_inputs_produce_identical_results()
    {
        var first = Calculate(baseAmountCents: 47_891, percentageBasisPoints: 265, fixedFeeCents: 30);

        for (var i = 0; i < 100; i++)
            Assert.Equal(first, Calculate(47_891, 265, 30));
    }

    [Theory]
    [InlineData(1, 0, 0)]
    [InlineData(1, 265, 30)]
    [InlineData(9_000, 1_000, 0)]
    [InlineData(10_000, 265, 30)]
    [InlineData(1_000_000, 999, 75)]
    public void Result_preserves_charge_invariant(long baseAmountCents, int percentageBasisPoints, long fixedFeeCents)
    {
        var result = Calculate(baseAmountCents, percentageBasisPoints, fixedFeeCents);

        Assert.Equal(
            result.ChargedAmountCents,
            result.BaseAmountCents + result.SurchargeAmountCents);
        Assert.True(result.SurchargeAmountCents >= 0);
        Assert.True(result.ChargedAmountCents >= result.BaseAmountCents);
    }

    [Fact]
    public void Result_contains_stable_calculation_version_and_input_snapshot()
    {
        var result = Calculate(baseAmountCents: 54_321, percentageBasisPoints: 321, fixedFeeCents: 45);

        Assert.Equal(54_321, result.BaseAmountCents);
        Assert.Equal(321, result.PercentageBasisPoints);
        Assert.Equal(45, result.FixedFeeCents);
        Assert.True(result.Enabled);
        Assert.Equal("stripe-gross-up-v1", result.CalculationVersion);
        Assert.Equal(StripeSurchargeCalculator.CurrentCalculationVersion, result.CalculationVersion);
    }

    private static StripeSurchargeCalculationResult Calculate(
        long baseAmountCents,
        int percentageBasisPoints,
        long fixedFeeCents) =>
        StripeSurchargeCalculator.Calculate(
            baseAmountCents,
            percentageBasisPoints,
            fixedFeeCents,
            enabled: true);
}
