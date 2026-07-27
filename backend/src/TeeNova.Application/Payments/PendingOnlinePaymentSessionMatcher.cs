using System;

namespace TeeNova.Payments;

/// <summary>
/// Decides whether an existing Pending <see cref="OnlinePaymentSession"/> may be reused for a new payment
/// attempt, or must be superseded (Phase 3, extending the Jira 9804 reuse rule).
///
/// Reuse requires the COMPLETE pricing snapshot to match — not merely the charged total. Two different
/// surcharge configurations can produce the same total (e.g. a rate cut offset by a higher fixed fee), and
/// reusing across them would charge the customer under a disclosure they never saw. Any difference in
/// provider, purpose, currency, base, surcharge, charged total, rate, fixed fee, calculation version or
/// Test/Live mode supersedes the pending session instead.
/// </summary>
public static class PendingOnlinePaymentSessionMatcher
{
    /// <summary>
    /// <paramref name="quote"/> is the freshly resolved Stripe snapshot, or null for a provider that issues
    /// no quote (non-Stripe). <paramref name="baseAmount"/> is the trusted commercial amount for this attempt.
    /// </summary>
    public static bool Matches(
        OnlinePaymentSession        existing,
        PaymentProvider             provider,
        PaymentPurpose              purpose,
        string                      currency,
        decimal                     baseAmount,
        StripePaymentQuoteSnapshot? quote)
    {
        if (existing is null)
            return false;

        if (existing.Status != OnlinePaymentSessionStatus.Pending)
            return false;

        if (existing.Provider != provider || existing.Purpose != purpose)
            return false;

        if (!string.Equals(existing.Currency, currency, StringComparison.OrdinalIgnoreCase))
            return false;

        // No surcharge on this attempt (non-Stripe provider, or Stripe with surcharge disabled): only a
        // LEGACY pending session at the same commercial amount may be reused. A surcharge-aware pending
        // session must be superseded, which is exactly the enabled → disabled transition.
        if (quote is null || !quote.SurchargeEnabled)
        {
            return existing.Amount          == baseAmount
                && existing.BaseAmount      == baseAmount
                && existing.SurchargeAmount == 0m
                && existing.SurchargePercentageBasisPoints == 0
                && existing.SurchargeFixedAmount           == 0m
                && string.Equals(
                       existing.SurchargeCalculationVersion,
                       OnlinePaymentSession.LegacyCalculationVersion,
                       StringComparison.Ordinal)
                && existing.ProviderMode is null;
        }

        // Surcharge-aware attempt: every snapshot field must match, including the mode the session was
        // created under (a Test → Live or Live → Test switch always supersedes).
        return existing.BaseAmount      == quote.BaseAmount
            && existing.SurchargeAmount == quote.SurchargeAmount
            && existing.Amount          == quote.ChargedAmount
            && existing.SurchargePercentageBasisPoints == quote.SurchargePercentageBasisPoints
            && existing.SurchargeFixedAmount           == quote.SurchargeFixedAmount
            && string.Equals(
                   existing.SurchargeCalculationVersion,
                   quote.SurchargeCalculationVersion,
                   StringComparison.Ordinal)
            && existing.ProviderMode == quote.ProviderMode;
    }
}
