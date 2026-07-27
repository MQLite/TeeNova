using System;
using Volo.Abp;

namespace TeeNova.Payments;

internal readonly record struct StripeSurchargeSettingsUpdate(
    bool?    Enabled,
    int?     PercentageBasisPoints,
    decimal? FixedAmount,
    string?  DisclosureText,
    string?  CalculationVersion);

internal static class StripeSurchargeSettingsUpdatePolicy
{
    public static bool Apply(PaymentProviderSetting setting, StripeSurchargeSettingsUpdate update)
    {
        var hasAny =
            update.Enabled.HasValue ||
            update.PercentageBasisPoints.HasValue ||
            update.FixedAmount.HasValue ||
            update.DisclosureText is not null ||
            update.CalculationVersion is not null;

        if (!hasAny)
            return false;

        var isComplete =
            update.Enabled.HasValue &&
            update.PercentageBasisPoints.HasValue &&
            update.FixedAmount.HasValue &&
            update.DisclosureText is not null &&
            update.CalculationVersion is not null;

        if (!isComplete)
            throw new BusinessException("TeeNova:Payment:SurchargeConfigurationIncomplete");

        try
        {
            setting.ConfigureSurcharge(
                update.Enabled!.Value,
                update.PercentageBasisPoints!.Value,
                update.FixedAmount!.Value,
                update.DisclosureText!,
                update.CalculationVersion!);
        }
        catch (ArgumentOutOfRangeException ex) when (ex.ParamName == "percentageBasisPoints")
        {
            throw new BusinessException("TeeNova:Payment:SurchargeRateInvalid");
        }
        catch (ArgumentOutOfRangeException ex) when (ex.ParamName == "fixedAmount")
        {
            throw new BusinessException("TeeNova:Payment:SurchargeFixedAmountInvalid");
        }
        catch (ArgumentException ex) when (ex.ParamName == "disclosureText")
        {
            var code = string.IsNullOrWhiteSpace(update.DisclosureText)
                ? "TeeNova:Payment:SurchargeDisclosureMissing"
                : "TeeNova:Payment:SurchargeDisclosureInvalid";
            throw new BusinessException(code);
        }
        catch (ArgumentException ex) when (ex.ParamName == "calculationVersion")
        {
            throw new BusinessException("TeeNova:Payment:SurchargeCalculationVersionUnsupported");
        }

        return true;
    }
}
