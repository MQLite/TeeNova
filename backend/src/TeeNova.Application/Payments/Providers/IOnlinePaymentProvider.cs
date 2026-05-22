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
    /// Parses and verifies an incoming webhook event from the provider.
    /// Implementations are responsible for signature verification before returning a result.
    /// Returns Outcome = Ignored for unrecognised or non-actionable events.
    /// </summary>
    Task<OnlinePaymentWebhookResult> ParseWebhookAsync(
        string                             rawBody,
        IReadOnlyDictionary<string, string> headers,
        CancellationToken                  cancellationToken = default);
}
