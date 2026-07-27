using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.Payments;

/// <summary>
/// Contract implemented by each online payment provider (Stripe, Windcave, POLi, PayPal, etc.).
/// Methods are provider-neutral — implementations translate provider-specific APIs into the
/// shared request/result models.
/// </summary>
public interface IOnlinePaymentProvider
{
    /// <summary>Identifies which provider this implementation handles.</summary>
    PaymentProvider Provider { get; }

    /// <summary>
    /// Creates a hosted checkout session with the provider and returns a redirect URL.
    /// Called by the app service when a customer initiates online payment.
    /// </summary>
    Task<CreateOnlinePaymentProviderSessionResult> CreatePaymentSessionAsync(
        CreateOnlinePaymentProviderSessionRequest request,
        CancellationToken                         cancellationToken = default);

    /// <summary>
    /// Best-effort provider-side expiration of a still-open hosted checkout session (Jira 9804).
    /// Called when the local system supersedes or cancels a Pending session (customer starts a new
    /// session, or an admin changes the order amount) so a lingering customer checkout tab cannot
    /// complete a charge the local system has already invalidated.
    /// Implementations MUST be idempotent and MUST NOT throw for already-expired / already-completed
    /// / unknown sessions — expiration is advisory; local cancellation remains authoritative.
    /// Implementations MUST NOT log provider secrets.
    ///
    /// <paramref name="providerMode"/> is the Test/Live mode stored on the local session (Phase 3).
    /// Implementations MUST use it to resolve credentials for THAT mode rather than whichever mode is
    /// currently active, and MUST NOT fall back across modes. Null means the historical mode is unknown
    /// (legacy sessions), in which case the pre-Phase-3 behaviour applies and no mode is guessed.
    /// </summary>
    Task ExpireSessionAsync(
        string               providerSessionId,
        PaymentProviderMode? providerMode      = null,
        CancellationToken    cancellationToken = default);

    /// <summary>
    /// Parses and verifies an incoming webhook event from the provider.
    /// Implementations are responsible for signature verification before returning a result.
    /// Returns Outcome = Ignored for unrecognised or non-actionable events.
    /// </summary>
    Task<OnlinePaymentWebhookResult> ParseWebhookAsync(
        string                             rawBody,
        IReadOnlyDictionary<string, string> headers,
        CancellationToken                  cancellationToken = default);
}
