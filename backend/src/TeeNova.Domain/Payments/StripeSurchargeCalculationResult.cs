namespace TeeNova.Payments;

/// <summary>
/// Immutable snapshot of a Stripe surcharge calculation expressed in NZD cents.
/// </summary>
public sealed record StripeSurchargeCalculationResult
{
    internal StripeSurchargeCalculationResult(
        long baseAmountCents,
        long surchargeAmountCents,
        long chargedAmountCents,
        int percentageBasisPoints,
        long fixedFeeCents,
        bool enabled,
        string calculationVersion)
    {
        BaseAmountCents        = baseAmountCents;
        SurchargeAmountCents   = surchargeAmountCents;
        ChargedAmountCents     = chargedAmountCents;
        PercentageBasisPoints = percentageBasisPoints;
        FixedFeeCents          = fixedFeeCents;
        Enabled                = enabled;
        CalculationVersion     = calculationVersion;
    }

    public long BaseAmountCents { get; }
    public long SurchargeAmountCents { get; }
    public long ChargedAmountCents { get; }
    public int PercentageBasisPoints { get; }
    public long FixedFeeCents { get; }
    public bool Enabled { get; }
    public string CalculationVersion { get; }
}
