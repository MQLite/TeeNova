using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;

namespace TeeNova.Payments;

/// <summary>Pure, side-effect-free admin projection over persisted session, transaction and webhook data.</summary>
public static class AdminOnlinePaymentSessionProjection
{
    public static List<AdminOnlinePaymentSessionDto> Build(
        IEnumerable<OnlinePaymentSession> sessions,
        IEnumerable<PaymentTransaction> transactions,
        IEnumerable<PaymentWebhookEvent> webhookEvents)
    {
        var transactionById = transactions.ToDictionary(t => t.Id);
        var events = webhookEvents.ToList();

        return sessions
            .OrderByDescending(s => s.CreationTime)
            .ThenByDescending(s => s.Id)
            .Select(session =>
            {
                transactionById.TryGetValue(session.PaymentTransactionId ?? Guid.Empty, out var transaction);
                var webhook = events
                    .Where(e => e.OnlinePaymentSessionId == session.Id
                        || string.Equals(e.ProviderSessionId, session.ProviderSessionId, StringComparison.Ordinal))
                    .OrderByDescending(e => e.ReceivedAt)
                    .ThenByDescending(e => e.Id)
                    .FirstOrDefault();

                var (status, message) = Reconcile(session, transaction, webhook);
                return new AdminOnlinePaymentSessionDto
                {
                    Id = session.Id,
                    Provider = session.Provider,
                    ProviderMode = session.ProviderMode,
                    Purpose = session.Purpose,
                    Status = session.Status,
                    Currency = session.Currency,
                    BaseAmount = session.BaseAmount,
                    SurchargeAmount = session.SurchargeAmount,
                    ChargedAmount = session.Amount,
                    SurchargePercentageBasisPoints = session.SurchargePercentageBasisPoints,
                    SurchargeFixedAmount = session.SurchargeFixedAmount,
                    SurchargeCalculationVersion = session.SurchargeCalculationVersion,
                    ProviderSessionId = session.ProviderSessionId,
                    ProviderPaymentId = session.ProviderPaymentId,
                    ProviderEventId = webhook?.ProviderEventId ?? session.LastProviderEventId,
                    PaymentTransactionId = session.PaymentTransactionId,
                    CommercialTransactionAmount = transaction?.Amount,
                    CreationTime = session.CreationTime,
                    CompletedTime = session.CompletedAt,
                    RawProviderStatus = session.RawProviderStatus,
                    WebhookStatus = webhook?.Status,
                    ObservedProviderAmount = webhook?.Amount,
                    ObservedCurrency = webhook?.Currency,
                    ReviewReasonCode = webhook?.RejectionCode,
                    ReconciliationStatus = status,
                    ReconciliationMessage = message,
                };
            })
            .ToList();
    }

    private static (AdminPaymentReconciliationStatus Status, string? Message) Reconcile(
        OnlinePaymentSession session,
        PaymentTransaction? transaction,
        PaymentWebhookEvent? webhook)
    {
        if (webhook?.RequiresManualReview == true)
            return (AdminPaymentReconciliationStatus.RequiresReview, SafeReviewMessage(webhook.RejectionCode));

        if (session.Amount != session.BaseAmount + session.SurchargeAmount)
            return (AdminPaymentReconciliationStatus.RequiresReview,
                "The stored payment amount does not match its commercial and surcharge snapshot.");

        var legacy = string.Equals(
            session.SurchargeCalculationVersion,
            OnlinePaymentSession.LegacyCalculationVersion,
            StringComparison.Ordinal);
        var current = string.Equals(
            session.SurchargeCalculationVersion,
            StripeSurchargeCalculator.CurrentCalculationVersion,
            StringComparison.Ordinal);

        if (!legacy && !current)
            return (AdminPaymentReconciliationStatus.RequiresReview,
                "The surcharge calculation version is unsupported.");

        if (!legacy && session.ProviderMode is null)
            return (AdminPaymentReconciliationStatus.RequiresReview,
                "The surcharge-aware payment session has no stored provider mode.");

        if (webhook?.Amount is decimal observed && observed != session.Amount)
            return (AdminPaymentReconciliationStatus.RequiresReview,
                "Amount received from the provider did not match the stored total.");

        if (!string.IsNullOrWhiteSpace(webhook?.Currency)
            && !string.Equals(webhook.Currency, session.Currency, StringComparison.OrdinalIgnoreCase))
            return (AdminPaymentReconciliationStatus.RequiresReview,
                "The provider currency did not match the payment session.");

        return session.Status switch
        {
            OnlinePaymentSessionStatus.Pending =>
                (AdminPaymentReconciliationStatus.Pending, null),
            OnlinePaymentSessionStatus.Cancelled =>
                (AdminPaymentReconciliationStatus.Cancelled, null),
            OnlinePaymentSessionStatus.Expired =>
                (AdminPaymentReconciliationStatus.Expired, null),
            OnlinePaymentSessionStatus.Failed =>
                (AdminPaymentReconciliationStatus.Failed, null),
            OnlinePaymentSessionStatus.Completed when transaction is null =>
                (AdminPaymentReconciliationStatus.RequiresReview,
                    "The completed payment has no matching commercial transaction."),
            OnlinePaymentSessionStatus.Completed when transaction!.Amount != session.BaseAmount =>
                (AdminPaymentReconciliationStatus.RequiresReview,
                    "The commercial transaction amount does not match the payment session base amount."),
            OnlinePaymentSessionStatus.Completed =>
                (AdminPaymentReconciliationStatus.Reconciled, null),
            _ => (AdminPaymentReconciliationStatus.RequiresReview,
                "The payment session has an unsupported status."),
        };
    }

    private static string SafeReviewMessage(string? code) => code switch
    {
        "TeeNova:Payment:WebhookAmountMismatch" =>
            "Amount received from the provider did not match the stored total.",
        "TeeNova:Payment:WebhookCurrencyMismatch" =>
            "The provider currency did not match the payment session.",
        OnlinePaymentSessionReconciliation.ModeMismatchCode =>
            "Stripe Test/Live mode did not match the payment session.",
        OnlinePaymentSessionReconciliation.SnapshotInvalidCode =>
            "The stored surcharge snapshot is invalid.",
        _ => "The provider event requires operator review.",
    };
}
