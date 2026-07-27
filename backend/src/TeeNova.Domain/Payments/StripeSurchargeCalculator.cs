using System;

namespace TeeNova.Payments;

/// <summary>
/// Calculates a grossed-up Stripe surcharge using integer NZD cents and basis points.
/// </summary>
public static class StripeSurchargeCalculator
{
    public const string CurrentCalculationVersion = StripeSurchargeDefaults.CalculationVersion;

    private const long BasisPointsScale = 10_000;

    public static StripeSurchargeCalculationResult Calculate(
        long baseAmountCents,
        int percentageBasisPoints,
        long fixedFeeCents,
        bool enabled)
    {
        if (baseAmountCents <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(baseAmountCents), baseAmountCents, "Base amount must be greater than zero.");

        if (percentageBasisPoints < 0 || percentageBasisPoints >= BasisPointsScale)
            throw new ArgumentOutOfRangeException(
                nameof(percentageBasisPoints),
                percentageBasisPoints,
                "Percentage basis points must be between 0 and 9,999.");

        if (fixedFeeCents < 0)
            throw new ArgumentOutOfRangeException(
                nameof(fixedFeeCents), fixedFeeCents, "Fixed fee must not be negative.");

        if (!enabled)
        {
            return new StripeSurchargeCalculationResult(
                baseAmountCents,
                surchargeAmountCents: 0,
                chargedAmountCents: baseAmountCents,
                percentageBasisPoints,
                fixedFeeCents,
                enabled,
                CurrentCalculationVersion);
        }

        long chargedAmountCents;
        long surchargeAmountCents;

        checked
        {
            var amountWithFixedFee = baseAmountCents + fixedFeeCents;
            var numerator          = amountWithFixedFee * BasisPointsScale;
            var denominator        = BasisPointsScale - percentageBasisPoints;
            var quotient           = numerator / denominator;
            var remainder          = numerator % denominator;

            // Add one cent only when integer division discarded a positive remainder.
            chargedAmountCents   = quotient + (remainder == 0 ? 0 : 1);
            surchargeAmountCents = chargedAmountCents - baseAmountCents;
        }

        return new StripeSurchargeCalculationResult(
            baseAmountCents,
            surchargeAmountCents,
            chargedAmountCents,
            percentageBasisPoints,
            fixedFeeCents,
            enabled,
            CurrentCalculationVersion);
    }
}
