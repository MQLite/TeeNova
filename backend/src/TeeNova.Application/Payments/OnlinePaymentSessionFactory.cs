using System;

namespace TeeNova.Payments;

/// <summary>
/// Chooses and applies the correct <see cref="OnlinePaymentSession"/> creation path once a provider session
/// exists (Phase 3).
///
/// The authoritative amounts come exclusively from the quote snapshot calculated BEFORE the provider call —
/// the provider result contributes only its session id and checkout URL, so a provider response can never
/// override the local pricing snapshot. When the surcharge is disabled (or there is no quote at all, i.e. a
/// non-Stripe provider) the legacy factory is used unchanged, keeping every pre-Phase-3 session identical.
/// </summary>
public static class OnlinePaymentSessionFactory
{
    public static OnlinePaymentSession Create(
        Guid                        paymentSessionId,
        Guid                        orderId,
        string                      orderNumber,
        PaymentProvider             provider,
        string                      providerSessionId,
        string                      providerCheckoutUrl,
        string                      currency,
        PaymentPurpose              purpose,
        decimal                     commercialBaseAmount,
        StripePaymentQuoteSnapshot? quote)
    {
        if (quote is { SurchargeEnabled: true })
        {
            return OnlinePaymentSession.CreateWithPaymentSnapshot(
                paymentSessionId,
                orderId,
                orderNumber,
                provider,
                providerSessionId,
                providerCheckoutUrl,
                currency,
                purpose,
                quote.BaseAmount,
                quote.SurchargeAmount,
                quote.ChargedAmount,
                quote.SurchargePercentageBasisPoints,
                quote.SurchargeFixedAmount,
                quote.SurchargeCalculationVersion,
                quote.ProviderMode);
        }

        return OnlinePaymentSession.Create(
            paymentSessionId,
            orderId,
            orderNumber,
            provider,
            providerSessionId,
            providerCheckoutUrl,
            commercialBaseAmount,
            currency,
            purpose);
    }
}
