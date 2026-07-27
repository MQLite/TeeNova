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

    /// <summary>
    /// True once the provider has cryptographically verified the event as authentic (Jira 9805/9806).
    /// Only verified events are eligible to create a durable <c>PaymentWebhookEvent</c> idempotency
    /// record — an invalid signature, missing signature, or empty body MUST leave this false so no
    /// trusted event record is ever created for an unauthenticated payload.
    /// </summary>
    public bool                        SignatureVerified { get; set; }

    /// <summary>Provider-native event type string (e.g. "checkout.session.completed"), when known.</summary>
    public string?                     ProviderEventType { get; set; }

    public string?                     ProviderSessionId { get; set; }
    public string?                     ProviderPaymentId { get; set; }
    public string?                     ProviderEventId   { get; set; }
    public string?                     RawProviderStatus { get; set; }
    public decimal?                    Amount            { get; set; }
    public string?                     Currency          { get; set; }

    /// <summary>
    /// Test/Live mode the provider reports the event was produced in (Phase 3; from Stripe's signed
    /// <c>livemode</c> flag). Null when the provider exposes no such indicator. For a surcharge-aware session
    /// this must equal <c>OnlinePaymentSession.ProviderMode</c>; a mismatch forces manual review. Legacy
    /// sessions carry no stored mode, so nothing is inferred or written for them.
    /// </summary>
    public PaymentProviderMode?        ProviderModeObserved { get; set; }
}
