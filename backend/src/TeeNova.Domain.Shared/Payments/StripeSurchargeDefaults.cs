namespace TeeNova.Payments;

/// <summary>Shared non-secret defaults and contract limits for Stripe surcharge configuration.</summary>
public static class StripeSurchargeDefaults
{
    public const string  CalculationVersion      = "stripe-gross-up-v1";

    /// <summary>
    /// Calculation version stamped on every payment session created before surcharge integration, and on
    /// every session created by the legacy (non-surcharge-aware) creation path. A session carrying this
    /// version always has a zero surcharge, a zero rate and a zero fixed fee, so its charged amount equals
    /// its commercial base amount.
    /// </summary>
    public const string  LegacyCalculationVersion = "legacy-no-surcharge";

    /// <summary>Maximum persisted length of a surcharge calculation version string.</summary>
    public const int     MaxCalculationVersionLength = 64;

    public const int     PercentageBasisPoints   = 265;
    public const decimal FixedAmount             = 0.30m;
    public const int     MaxDisclosureTextLength = 500;
    public const string  DisclosureText          =
        "A card processing surcharge applies to online card payments. The fee is shown before you continue to Stripe.";
}
