using TeeNova.Payments;

namespace TeeNova.Orders.Dtos;

public class CreateOnlinePaymentSessionDto
{
    /// <summary>
    /// Provider to use for this session. If null or None, the server uses OnlinePaymentOptions.DefaultProvider.
    /// </summary>
    public PaymentProvider? Provider { get; set; }

    /// <summary>
    /// Payment purpose hint from the client. Server validates and may override based on order state.
    /// If null, the server derives the correct purpose from the order's payment state.
    /// </summary>
    public PaymentPurpose? Purpose { get; set; }

    /// <summary>
    /// Fingerprint of the payment quote the customer was shown (Phase 3). NOT an amount and NOT an
    /// authorisation token — it only proves the client is paying against the figures and disclosure it
    /// displayed. The server always recalculates every amount from trusted pricing and current settings.
    ///
    /// Optional while the Stripe surcharge is disabled (the legacy flow is preserved for the current
    /// frontend). Once the surcharge is enabled it is REQUIRED: a missing value fails with
    /// <c>TeeNova:Payment:StripeSurchargeQuoteRequired</c> and a stale one with
    /// <c>TeeNova:Payment:StripeSurchargeQuoteStale</c>, in both cases before any Stripe API call.
    ///
    /// There is deliberately no writable field here for base amount, surcharge, charged total, rate, fixed
    /// fee, provider mode or calculation version.
    /// </summary>
    public string? PaymentQuoteFingerprint { get; set; }
}
