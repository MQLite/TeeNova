namespace TeeNova.Payments;

/// <summary>
/// Provider-neutral result returned by IOnlinePaymentProvider.CreatePaymentSessionAsync.
/// ProviderSessionId and ProviderCheckoutUrl are always populated on success.
/// </summary>
public class CreateOnlinePaymentProviderSessionResult
{
    public PaymentProvider Provider            { get; set; }
    public string          ProviderSessionId   { get; set; } = string.Empty;
    public string          ProviderCheckoutUrl { get; set; } = string.Empty;

    /// <summary>
    /// Provider-specific payment identifier. May be null until the payment is confirmed.
    /// </summary>
    public string? ProviderPaymentId  { get; set; }

    /// <summary>
    /// Raw status string from the provider at session creation time. Provider-specific; for logging only.
    /// </summary>
    public string? RawProviderStatus  { get; set; }
}
