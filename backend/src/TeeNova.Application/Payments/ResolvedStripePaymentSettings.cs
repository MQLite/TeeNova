namespace TeeNova.Payments;

/// <summary>
/// Internal runtime snapshot resolved from one enabled Stripe provider/mode row.
/// Secret values must never be returned through an HTTP or frontend DTO.
/// </summary>
public sealed record ResolvedStripePaymentSettings(
    PaymentProvider     Provider,
    PaymentProviderMode Mode,
    bool                IsEnabled,
    string              Currency,
    string?             PublishableKey,
    string              SecretKey,
    string              WebhookSecret,
    string?             SuccessReturnBaseUrl,
    string?             CancelReturnBaseUrl,
    bool                SurchargeEnabled,
    int                 SurchargePercentageBasisPoints,
    decimal             SurchargeFixedAmount,
    string              SurchargeDisclosureText,
    string              SurchargeCalculationVersion,
    bool                SurchargeConfigurationValid);
