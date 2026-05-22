namespace TeeNova.Payments;

/// <summary>
/// Provider-neutral outcome produced by IOnlinePaymentProvider.ParseWebhookAsync.
/// Each provider implementation maps its event type to one of these outcomes.
/// </summary>
public enum OnlinePaymentWebhookOutcome
{
    /// <summary>Event type is unrecognised or not actionable — no state change required.</summary>
    Ignored          = 0,
    PaymentCompleted = 1,
    PaymentCancelled = 2,
    PaymentExpired   = 3,
    PaymentFailed    = 4,
}

/// <summary>
/// Normalized, provider-neutral result produced after parsing a raw provider webhook event.
/// The webhook handler uses this to update OnlinePaymentSession without knowing provider details.
/// </summary>
public class OnlinePaymentWebhookResult
{
    public PaymentProvider             Provider          { get; set; }
    public OnlinePaymentWebhookOutcome Outcome           { get; set; }
    public string?                     ProviderSessionId { get; set; }
    public string?                     ProviderPaymentId { get; set; }
    public string?                     ProviderEventId   { get; set; }
    public string?                     RawProviderStatus { get; set; }
    public decimal?                    Amount            { get; set; }
    public string?                     Currency          { get; set; }
}
