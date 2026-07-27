using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// Fail-closed gate that decides whether a Stripe payment attempt may proceed given the freshly recomputed
/// quote and the fingerprint the client echoed back (Phase 3).
///
/// Compatibility rule with the not-yet-updated frontend:
/// <list type="bullet">
///   <item>surcharge DISABLED — no fingerprint required; the legacy no-surcharge flow is preserved exactly;</item>
///   <item>surcharge ENABLED, fingerprint missing — <c>StripeSurchargeQuoteRequired</c>, so an older client can
///         never silently charge an undisclosed fee;</item>
///   <item>surcharge ENABLED, fingerprint stale — <c>StripeSurchargeQuoteStale</c>, so the customer must see the
///         current disclosure before deliberately trying again.</item>
/// </list>
/// Both failures are raised BEFORE any provider session is created, any local session is written, and any
/// valid pending session is superseded. The supplied fingerprint is never logged (it is client-controlled
/// input, kept out of logs on principle even though it carries no secret).
/// </summary>
public static class StripePaymentQuoteGate
{
    public const string QuoteRequiredErrorCode = "TeeNova:Payment:StripeSurchargeQuoteRequired";
    public const string QuoteStaleErrorCode    = "TeeNova:Payment:StripeSurchargeQuoteStale";

    public static void Ensure(StripePaymentQuoteSnapshot quote, string? suppliedFingerprint)
    {
        Check.NotNull(quote, nameof(quote));

        if (!quote.SurchargeEnabled)
            return;

        if (string.IsNullOrWhiteSpace(suppliedFingerprint))
            throw new BusinessException(QuoteRequiredErrorCode)
                .WithData("Provider", quote.Provider)
                .WithData("Purpose", quote.Purpose);

        if (!StripePaymentQuoteFingerprint.Matches(suppliedFingerprint, quote.QuoteFingerprint))
            throw new BusinessException(QuoteStaleErrorCode)
                .WithData("Provider", quote.Provider)
                .WithData("Purpose", quote.Purpose);
    }
}
