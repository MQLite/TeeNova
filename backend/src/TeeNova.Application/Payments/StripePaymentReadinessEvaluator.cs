using System.Collections.Generic;

namespace TeeNova.Payments;

internal readonly record struct StripePaymentReadiness(
    string                          Code,
    List<string>                    Missing,
    bool                            CanCreate,
    bool                            ReturnUrlsValid,
    PaymentProviderValidationStatus Status,
    string?                         SurchargeValidationCode);

internal static class StripePaymentReadinessEvaluator
{
    public static StripePaymentReadiness Evaluate(
        PaymentProviderSetting? setting,
        bool returnUrlsValid,
        bool encryptionReady)
    {
        var missing = new List<string>();

        if (setting is null)
        {
            missing.Add("NotConfigured");
            if (!encryptionReady)
                missing.Add("EncryptionPassphraseNotConfigured");

            return new StripePaymentReadiness(
                "NotConfigured",
                missing,
                CanCreate: false,
                ReturnUrlsValid: false,
                PaymentProviderValidationStatus.Invalid,
                SurchargeValidationCode: null);
        }

        var surchargeCode = setting.GetSurchargeValidationCode();

        if (!setting.HasSecretKey)     missing.Add("MissingSecretKey");
        if (!setting.HasWebhookSecret) missing.Add("MissingWebhookSecret");
        if (!returnUrlsValid)          missing.Add("InvalidReturnUrl");
        if (!setting.IsEnabled)        missing.Add("NotEnabled");
        if (surchargeCode is not null) missing.Add(surchargeCode);
        if (!encryptionReady)          missing.Add("EncryptionPassphraseNotConfigured");

        var configValid =
            setting.HasSecretKey &&
            setting.HasWebhookSecret &&
            returnUrlsValid &&
            surchargeCode is null;
        var canCreate = configValid && setting.IsEnabled;

        string code;
        PaymentProviderValidationStatus status;

        if (!setting.HasSecretKey)
        {
            code = "MissingSecretKey";
            status = PaymentProviderValidationStatus.Invalid;
        }
        else if (!setting.HasWebhookSecret)
        {
            code = "MissingWebhookSecret";
            status = PaymentProviderValidationStatus.Invalid;
        }
        else if (!returnUrlsValid)
        {
            code = "InvalidReturnUrl";
            status = PaymentProviderValidationStatus.Invalid;
        }
        else if (surchargeCode is not null)
        {
            code = surchargeCode;
            status = PaymentProviderValidationStatus.Invalid;
        }
        else if (!setting.IsEnabled)
        {
            code = "ConfiguredButDisabled";
            status = PaymentProviderValidationStatus.Valid;
        }
        else
        {
            code = "ReadyForManualSmoke";
            status = PaymentProviderValidationStatus.Valid;
        }

        return new StripePaymentReadiness(
            code,
            missing,
            canCreate,
            returnUrlsValid,
            status,
            surchargeCode);
    }
}
