using System.Threading;
using System.Threading.Tasks;
using TeeNova.Payments.Dtos;

namespace TeeNova.Payments;

/// <summary>
/// The single runtime path that turns a trusted commercial amount into an authoritative Stripe payment quote
/// (Phase 3). Shared by the draft-order quote endpoint, the existing-order quote endpoint, online payment
/// session creation, and the Stripe provider's pre-call race check — so those four callers can never disagree
/// about the amount the customer will be charged.
/// </summary>
public interface IStripePaymentQuoteService
{
    /// <summary>
    /// Resolves the active Stripe mode + settings and computes the authoritative, secret-free quote snapshot
    /// for <paramref name="trustedBaseAmount"/>. Fails closed on missing/disabled/invalid settings, an
    /// unsupported currency, a non-cent-aligned amount, or an unsupported calculation version.
    /// </summary>
    Task<StripePaymentQuoteSnapshot> ResolveQuoteAsync(
        decimal           trustedBaseAmount,
        PaymentPurpose    purpose,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Same resolution, additionally returning the decrypted settings for immediate in-process use by the
    /// Stripe provider (one resolution serves both the race check and the API credentials).
    ///
    /// SECURITY: the returned <see cref="StripeResolvedCheckoutQuote.Settings"/> holds live secret material —
    /// never log, serialize, cache or return it beyond the calling method.
    /// </summary>
    Task<StripeResolvedCheckoutQuote> ResolveCheckoutAsync(
        decimal           trustedBaseAmount,
        PaymentPurpose    purpose,
        CancellationToken cancellationToken = default);

    /// <summary>Projects a snapshot onto the safe public DTO (no secrets, no provider mode).</summary>
    OnlinePaymentQuoteDto ToDto(StripePaymentQuoteSnapshot snapshot);
}
