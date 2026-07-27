using System;

namespace TeeNova.Payments;

/// <summary>A safe, machine-readable reconciliation failure: an error code plus a non-sensitive message.</summary>
public sealed record OnlinePaymentReconciliationFailure(string Code, string Message);

/// <summary>
/// Pure validation of a verified provider "payment completed" event against the local session's frozen
/// pricing snapshot (Phase 3). No I/O, no logging, no mutation — so the exact reconciliation rules are unit
/// testable and identical for every caller.
///
/// The Phase 3 accounting boundary this enforces:
/// <code>
/// compare the provider's charged total against OnlinePaymentSession.Amount
/// apply only OnlinePaymentSession.BaseAmount to the order
/// record only BaseAmount in the commercial PaymentTransaction
/// leave SurchargeAmount recorded on the session alone
/// </code>
/// Legacy sessions are unaffected because <c>BaseAmount == Amount</c> and <c>SurchargeAmount == 0</c>.
/// </summary>
public static class OnlinePaymentSessionReconciliation
{
    public const string SnapshotInvalidCode   = "TeeNova:Payment:WebhookSessionSnapshotInvalid";
    public const string VersionUnsupportedCode = "TeeNova:Payment:WebhookSurchargeVersionUnsupported";
    public const string ModeMissingCode        = "TeeNova:Payment:WebhookSurchargeSessionModeMissing";
    public const string ModeMismatchCode       = "TeeNova:Payment:WebhookProviderModeMismatch";

    /// <summary>True when the session carries a real surcharge snapshot rather than the legacy stamp.</summary>
    public static bool IsSurchargeAware(OnlinePaymentSession session)
        => string.Equals(
            session.SurchargeCalculationVersion,
            StripeSurchargeCalculator.CurrentCalculationVersion,
            StringComparison.Ordinal);

    public static bool IsLegacy(OnlinePaymentSession session)
        => string.Equals(
            session.SurchargeCalculationVersion,
            OnlinePaymentSession.LegacyCalculationVersion,
            StringComparison.Ordinal);

    /// <summary>
    /// The ONLY amount that may reach <c>Order.ApplyPayment</c> and <c>PaymentTransaction.Amount</c>.
    /// The surcharge is a provider fee, never commercial order revenue.
    /// </summary>
    public static decimal CommercialAmount(OnlinePaymentSession session) => session.BaseAmount;

    /// <summary>
    /// Validates the session's own snapshot invariants and, for a surcharge-aware session, that the provider
    /// completed the payment in the SAME Test/Live mode the session was created under.
    /// Returns null when the session is safe to settle.
    /// </summary>
    public static OnlinePaymentReconciliationFailure? ValidateSnapshot(
        OnlinePaymentSession session,
        PaymentProviderMode? observedMode)
    {
        if (session.SurchargeAmount < 0m || session.BaseAmount <= 0m)
            return new OnlinePaymentReconciliationFailure(
                SnapshotInvalidCode,
                $"Session snapshot has non-positive base ({session.BaseAmount}) or negative surcharge " +
                $"({session.SurchargeAmount}).");

        if (!StripeMoney.IsCentAligned(session.BaseAmount)
            || !StripeMoney.IsCentAligned(session.SurchargeAmount)
            || !StripeMoney.IsCentAligned(session.Amount)
            || !StripeMoney.IsCentAligned(session.SurchargeFixedAmount))
        {
            return new OnlinePaymentReconciliationFailure(
                SnapshotInvalidCode,
                "Session snapshot contains a value that is not exactly cent-aligned.");
        }

        // Exact decimal identity — never a tolerance.
        if (session.Amount != session.BaseAmount + session.SurchargeAmount)
            return new OnlinePaymentReconciliationFailure(
                SnapshotInvalidCode,
                $"Session amount {session.Amount} does not equal base {session.BaseAmount} plus surcharge " +
                $"{session.SurchargeAmount}.");

        if (IsLegacy(session))
        {
            if (session.BaseAmount != session.Amount || session.SurchargeAmount != 0m)
                return new OnlinePaymentReconciliationFailure(
                    SnapshotInvalidCode,
                    "Legacy session must have a zero surcharge and a base equal to its charged amount.");

            // A legacy session's historical Test/Live mode is unknowable from stored data, so no mode
            // reconciliation is attempted and nothing is inferred or written.
            return null;
        }

        if (!IsSurchargeAware(session))
            return new OnlinePaymentReconciliationFailure(
                VersionUnsupportedCode,
                $"Session carries unsupported calculation version '{session.SurchargeCalculationVersion}'.");

        if (session.ProviderMode is null)
            return new OnlinePaymentReconciliationFailure(
                ModeMissingCode,
                "Surcharge-aware session has no recorded provider mode.");

        if (observedMode is not null && observedMode != session.ProviderMode)
            return new OnlinePaymentReconciliationFailure(
                ModeMismatchCode,
                $"Provider reported mode {observedMode} but the session was created in {session.ProviderMode}.");

        return null;
    }
}
