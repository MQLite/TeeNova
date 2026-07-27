using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Email;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;

namespace TeeNova.Payments;

/// <summary>
/// Processes verified provider webhook events with durable idempotency / replay protection (Jira 9806).
///
/// Flow: the provider verifies the signature and returns a normalized result. Only a SignatureVerified
/// result with a provider event id is eligible for processing. The event is first registered in a
/// durable <see cref="PaymentWebhookEvent"/> record (unique on provider + event id) BEFORE any business
/// side effect runs. A re-delivery of an already-terminal event is acknowledged with no side effects.
/// Every processed event is finalized to a terminal <see cref="PaymentWebhookEventStatus"/> so out-of-order
/// / non-actionable events (e.g. a checkout that completes after its session was cancelled) are recorded
/// for later reconciliation (Jira 9810) instead of being silently lost or blindly applied.
/// </summary>
public class OnlinePaymentWebhookAppService : ApplicationService, IOnlinePaymentWebhookAppService
{
    private readonly IOnlinePaymentProviderResolver          _providerResolver;
    private readonly IRepository<OnlinePaymentSession, Guid> _sessionRepository;
    private readonly IRepository<Order, Guid>                _orderRepository;
    private readonly IRepository<PaymentTransaction, Guid>   _transactionRepository;
    private readonly IRepository<OrderTimelineEntry, Guid>   _timelineRepository;
    private readonly IRepository<PaymentWebhookEvent, Guid>  _webhookEventRepository;
    private readonly IOrderEmailNotificationService          _emailService;

    public OnlinePaymentWebhookAppService(
        IOnlinePaymentProviderResolver          providerResolver,
        IRepository<OnlinePaymentSession, Guid> sessionRepository,
        IRepository<Order, Guid>                orderRepository,
        IRepository<PaymentTransaction, Guid>   transactionRepository,
        IRepository<OrderTimelineEntry, Guid>   timelineRepository,
        IRepository<PaymentWebhookEvent, Guid>  webhookEventRepository,
        IOrderEmailNotificationService          emailService)
    {
        _providerResolver       = providerResolver;
        _sessionRepository      = sessionRepository;
        _orderRepository        = orderRepository;
        _transactionRepository  = transactionRepository;
        _timelineRepository     = timelineRepository;
        _webhookEventRepository = webhookEventRepository;
        _emailService           = emailService;
    }

    public async Task HandleWebhookAsync(
        string                              provider,
        string                              rawBody,
        IReadOnlyDictionary<string, string> headers,
        CancellationToken                   cancellationToken = default)
    {
        if (!TryParseProvider(provider, out var paymentProvider))
        {
            Logger.LogWarning("[Webhook] Unknown provider '{Provider}' — ignoring.", provider);
            return;
        }

        IOnlinePaymentProvider impl;
        try
        {
            impl = _providerResolver.Resolve(paymentProvider);
        }
        catch (InvalidOperationException ex)
        {
            Logger.LogWarning(ex,
                "[Webhook] No implementation registered for provider '{Provider}' — ignoring.",
                paymentProvider);
            return;
        }

        var result = await impl.ParseWebhookAsync(rawBody, headers, cancellationToken);

        // Untrusted payloads (empty body, missing/invalid signature) MUST NOT create a trusted event
        // record. The provider signals authenticity via SignatureVerified (Jira 9805/9806).
        if (!result.SignatureVerified)
        {
            Logger.LogWarning(
                "[Webhook] Provider '{Provider}' returned an unverified result ({RawStatus}) — ignoring, no record.",
                paymentProvider, result.RawProviderStatus ?? "(none)");
            return;
        }

        // A verified event with no provider event id cannot be deduplicated. Handle safely and log —
        // do not run business side effects and do not create a record we cannot key.
        if (string.IsNullOrWhiteSpace(result.ProviderEventId))
        {
            Logger.LogWarning(
                "[Webhook] Verified '{Provider}' event ({EventType}) has no provider event id — " +
                "ignoring without side effects.",
                paymentProvider, result.ProviderEventType ?? "(unknown)");
            return;
        }

        // Durable replay guard: register the event before any side effect.
        var (eventId, isDuplicate) = await RegisterWebhookEventAsync(result, cancellationToken);

        if (isDuplicate)
        {
            Logger.LogInformation(
                "[Webhook] Duplicate '{Provider}' event '{EventId}' — acknowledged, no side effects.",
                paymentProvider, result.ProviderEventId);
            return;
        }

        // Load the just-registered record into the ambient unit of work so its terminal status commits
        // atomically with any payment side effects.
        var webhookEvent = await _webhookEventRepository.GetAsync(eventId);

        switch (result.Outcome)
        {
            case OnlinePaymentWebhookOutcome.Ignored:
                webhookEvent.MarkIgnored(result.RawProviderStatus ?? "ignored", Clock.Now);
                await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
                break;

            case OnlinePaymentWebhookOutcome.PaymentCompleted:
                await ProcessPaymentCompletedAsync(result, webhookEvent, cancellationToken);
                break;

            case OnlinePaymentWebhookOutcome.PaymentCancelled:
                await ProcessTerminalEventAsync(result, webhookEvent, OnlinePaymentSessionStatus.Cancelled, cancellationToken);
                break;

            case OnlinePaymentWebhookOutcome.PaymentExpired:
                await ProcessTerminalEventAsync(result, webhookEvent, OnlinePaymentSessionStatus.Expired, cancellationToken);
                break;

            case OnlinePaymentWebhookOutcome.PaymentFailed:
                await ProcessTerminalEventAsync(result, webhookEvent, OnlinePaymentSessionStatus.Failed, cancellationToken);
                break;

            default:
                Logger.LogWarning(
                    "[Webhook] Unhandled outcome '{Outcome}' from provider '{Provider}' — recording as Ignored.",
                    result.Outcome, paymentProvider);
                webhookEvent.MarkIgnored($"unhandled_outcome_{result.Outcome}", Clock.Now);
                await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
                break;
        }
    }

    // ── Event registration (durable replay guard) ─────────────────────────────

    /// <summary>
    /// Registers the provider event in its own committed unit of work so the record (and its unique
    /// provider+event-id claim) is durable and visible to concurrent deliveries before any business
    /// logic runs. Returns IsDuplicate=true when the event has already reached a terminal outcome or a
    /// concurrent delivery won the insert race; IsDuplicate=false (with the record id) when this
    /// delivery should process the event — either a brand-new event or a re-attempt of a prior
    /// non-terminal record (e.g. an earlier infrastructure failure).
    /// </summary>
    private async Task<(Guid EventId, bool IsDuplicate)> RegisterWebhookEventAsync(
        OnlinePaymentWebhookResult result,
        CancellationToken          cancellationToken)
    {
        using var uow = UnitOfWorkManager.Begin(requiresNew: true, isTransactional: true);

        var query    = await _webhookEventRepository.GetQueryableAsync();
        var existing = await query.FirstOrDefaultAsync(
            e => e.Provider == result.Provider && e.ProviderEventId == result.ProviderEventId,
            cancellationToken);

        if (existing != null)
        {
            if (existing.IsTerminal)
            {
                existing.RegisterDuplicate(Clock.Now);
                await _webhookEventRepository.UpdateAsync(existing, autoSave: true);
                await uow.CompleteAsync();
                return (existing.Id, true);
            }

            // A prior attempt registered but did not reach a terminal outcome — allow re-processing.
            await uow.CompleteAsync();
            return (existing.Id, false);
        }

        var ev = PaymentWebhookEvent.Create(
            GuidGenerator.Create(),
            result.Provider,
            result.ProviderEventId!,
            result.ProviderEventType,
            result.ProviderSessionId,
            result.ProviderPaymentId,
            result.Amount,
            result.Currency,
            Clock.Now);

        try
        {
            await _webhookEventRepository.InsertAsync(ev, autoSave: true);
            await uow.CompleteAsync();
            return (ev.Id, false);
        }
        catch (Exception ex) when (IsUniqueConstraintViolation(ex))
        {
            // A concurrent delivery of the same event won the unique insert. Treat this one as a
            // duplicate and let the winner own processing (rolls back via using-dispose).
            Logger.LogInformation(
                "[Webhook] Concurrent duplicate for provider '{Provider}' event '{EventId}' — acknowledging replay.",
                result.Provider, result.ProviderEventId);
            return (Guid.Empty, true);
        }
    }

    // ── PaymentCompleted ──────────────────────────────────────────────────────

    private async Task ProcessPaymentCompletedAsync(
        OnlinePaymentWebhookResult result,
        PaymentWebhookEvent        webhookEvent,
        CancellationToken          cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(result.ProviderSessionId))
        {
            // A completed (charged) event we cannot tie to a local session — must not be lost.
            await MarkEventManualReviewAsync(webhookEvent,
                "TeeNova:Payment:WebhookMissingProviderSessionId",
                "Completed event carried no provider session id.");
            return;
        }

        var session = await FindSessionAsync(result.Provider, result.ProviderSessionId, cancellationToken);

        if (session == null)
        {
            await MarkEventManualReviewAsync(webhookEvent,
                "TeeNova:Payment:WebhookSessionNotFound",
                $"Completed event references unknown provider session '{result.ProviderSessionId}'.");
            return;
        }

        // Already settled (possibly by a different event id for the same session): idempotent no-op.
        if (session.Status == OnlinePaymentSessionStatus.Completed || session.PaymentTransactionId.HasValue)
        {
            Logger.LogInformation(
                "[Webhook] Session '{SessionId}' already Completed — recording event as Ignored.",
                session.Id);
            webhookEvent.MarkIgnored("session_already_completed", Clock.Now, session.OrderId, session.Id);
            await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
            return;
        }

        // Completed event for a session the local system already closed (cancelled/superseded/expired/
        // failed — e.g. an admin price/content change cancelled it). The provider likely charged the
        // customer, so this must be surfaced for reconciliation rather than dropped or applied.
        if (session.Status != OnlinePaymentSessionStatus.Pending)
        {
            await MarkEventManualReviewAsync(webhookEvent,
                "TeeNova:Payment:WebhookSessionNotActionable",
                $"Completed event for session in non-pending state '{session.Status}'.",
                session);
            return;
        }

        // From here the session is Pending. Validate the completed event against local state. Any
        // failure on a completed (charged) event is treated as needing manual review, and the pending
        // session is closed as Failed so it is no longer actionable locally.
        if (!result.Amount.HasValue)
        {
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookMissingAmount",
                "Completed event carried no amount.");
            return;
        }

        // The provider charged the CARD, so its total is reconciled against the session's charged total
        // (Amount = BaseAmount + SurchargeAmount). Exact comparison — never a tolerance.
        if (result.Amount.Value != session.Amount)
        {
            Logger.LogWarning(
                "[Webhook] Amount mismatch for session '{SessionId}': webhook={WebhookAmount} session={SessionAmount}.",
                session.Id, result.Amount.Value, session.Amount);
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookAmountMismatch",
                $"Completed amount {result.Amount.Value} did not match session amount {session.Amount}.");
            return;
        }

        if (string.IsNullOrWhiteSpace(result.Currency)
            || !string.Equals(result.Currency, session.Currency, StringComparison.OrdinalIgnoreCase))
        {
            Logger.LogWarning(
                "[Webhook] Currency mismatch for session '{SessionId}': webhook={WebhookCurrency} session={SessionCurrency}.",
                session.Id, result.Currency, session.Currency);
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookCurrencyMismatch",
                $"Completed currency '{result.Currency ?? "(null)"}' did not match session currency '{session.Currency}'.");
            return;
        }

        // Snapshot + Test/Live reconciliation (Phase 3): the session's own pricing snapshot must be internally
        // consistent, its calculation version supported, and — for a surcharge-aware session — the mode the
        // provider completed the payment in must be the mode the session was created under. Anything else on
        // a CHARGED event goes to manual review rather than being applied.
        var snapshotFailure = OnlinePaymentSessionReconciliation.ValidateSnapshot(
            session, result.ProviderModeObserved);

        if (snapshotFailure is not null)
        {
            Logger.LogWarning(
                "[Webhook] Snapshot reconciliation failed for session '{SessionId}' ({Code}): expected base " +
                "{BaseAmount}, surcharge {SurchargeAmount}, charged {ChargedAmount}; session mode {SessionMode}, " +
                "observed mode {ObservedMode}.",
                session.Id, snapshotFailure.Code, session.BaseAmount, session.SurchargeAmount, session.Amount,
                session.ProviderMode?.ToString() ?? "(none)",
                result.ProviderModeObserved?.ToString() ?? "(unknown)");

            await RejectPendingCompletedAsync(
                webhookEvent, session, snapshotFailure.Code, snapshotFailure.Message);
            return;
        }

        var order = await _orderRepository.FindAsync(session.OrderId);

        if (order == null)
        {
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookOrderNotFound",
                $"Order '{session.OrderId}' for the session was not found.");
            return;
        }

        if (order.Status == OrderStatus.Cancelled)
        {
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookOrderCancelled",
                $"Order '{order.OrderNumber}' is cancelled.");
            return;
        }

        if (order.Status == OrderStatus.Completed)
        {
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookOrderCompleted",
                $"Order '{order.OrderNumber}' is already completed.");
            return;
        }

        if (order.BalanceAmount <= 0)
        {
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookNoBalanceDue",
                $"Order '{order.OrderNumber}' has no balance due.");
            return;
        }

        // COMMERCIAL boundary (Phase 3): the order balance is compared with — and settled by — the session's
        // BaseAmount only. The card-processing surcharge is a provider fee, never order revenue, so comparing
        // the charged total here would reject every correctly surcharged payment as an overpayment.
        // Legacy sessions are unaffected: BaseAmount == Amount.
        var commercialAmount = OnlinePaymentSessionReconciliation.CommercialAmount(session);

        if (commercialAmount > order.BalanceAmount)
        {
            Logger.LogWarning(
                "[Webhook] Overpayment for order '{OrderId}': commercial amount {Amount} > balance {Balance}.",
                order.Id, commercialAmount, order.BalanceAmount);
            await RejectPendingCompletedAsync(webhookEvent, session,
                "TeeNova:Payment:WebhookOverpayment",
                $"Session base amount {commercialAmount} exceeds order balance {order.BalanceAmount}.");
            return;
        }

        // ── Apply the payment exactly once ─────────────────────────────────────
        var reference = result.ProviderPaymentId ?? session.ProviderSessionId;
        var note      = $"Online payment via {session.Provider}.";

        order.ApplyPayment(commercialAmount, ManualPaymentMethod.Online, reference, note, Clock.Now);

        var transaction = new PaymentTransaction(
            GuidGenerator.Create(),
            order.Id,
            commercialAmount,
            ManualPaymentMethod.Online,
            reference,
            note);

        await _transactionRepository.InsertAsync(transaction, autoSave: false);
        await _orderRepository.UpdateAsync(order, autoSave: false);

        session.MarkCompleted(
            providerPaymentId:    result.ProviderPaymentId,
            providerEventId:      result.ProviderEventId,
            rawProviderStatus:    result.RawProviderStatus,
            paymentTransactionId: transaction.Id,
            completedAt:          Clock.Now);

        await _sessionRepository.UpdateAsync(session, autoSave: false);

        // Finalize the event in the SAME unit of work so "Processed" commits atomically with the
        // payment — if the transaction rolls back, the event stays non-terminal and a re-delivery
        // re-attempts (the session-status guard above prevents any double application).
        webhookEvent.MarkProcessed(order.Id, session.Id, Clock.Now);
        await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);

        // Reconciliation breadcrumb (Jira 9809): one structured line correlating the online payment across
        // order / session / provider event / transaction using safe IDs + amount only — no card data, no
        // customer PII, no raw payload. Lets support tie a Stripe dashboard charge to the local records.
        Logger.LogInformation(
            "[Webhook] Payment applied — order {OrderNumber} ({OrderId}), session {SessionId}, " +
            "provider {Provider}, mode {Mode}, event {ProviderEventId}, transaction {TransactionId}, " +
            "commercial {CommercialAmount} + surcharge {SurchargeAmount} = charged {ChargedAmount} {Currency}.",
            order.OrderNumber, order.Id, session.Id, session.Provider,
            session.ProviderMode?.ToString() ?? "legacy",
            result.ProviderEventId, transaction.Id,
            commercialAmount, session.SurchargeAmount, session.Amount, session.Currency);

        var timelineDesc = BuildPaymentTimelineDescription(session, commercialAmount, reference);

        await AddTimelineEntryAsync(order.Id, OrderEventType.PaymentReceived, timelineDesc, order.Status);

        // Receipt email — best-effort, must not block payment recording or the webhook response. A
        // surcharge-aware payment passes its snapshot so the receipt can distinguish the commercial amount
        // from the total actually charged to the card.
        try
        {
            await _emailService.SendPaymentReceiptAsync(
                order,
                transaction,
                session.SurchargeAmount > 0m
                    ? new PaymentSurchargeReceiptDetail(
                        session.BaseAmount, session.SurchargeAmount, session.Amount, session.Currency)
                    : null);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Failed to send payment receipt for order {OrderNumber} after online payment webhook.",
                order.OrderNumber);
        }
    }

    // ── Cancelled / Expired / Failed ──────────────────────────────────────────

    private async Task ProcessTerminalEventAsync(
        OnlinePaymentWebhookResult result,
        PaymentWebhookEvent        webhookEvent,
        OnlinePaymentSessionStatus targetStatus,
        CancellationToken          cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(result.ProviderSessionId))
        {
            // e.g. Stripe payment_intent.payment_failed carries no checkout session id. No local
            // state to change and no charge to reconcile — record as Ignored.
            Logger.LogInformation(
                "[Webhook] Terminal outcome '{Outcome}' from '{Provider}' has no provider session id — recording Ignored.",
                result.Outcome, result.Provider);
            webhookEvent.MarkIgnored("terminal_event_no_session_id", Clock.Now);
            await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
            return;
        }

        var session = await FindSessionAsync(result.Provider, result.ProviderSessionId, cancellationToken);

        if (session == null)
        {
            // A cancel/expire/fail for an unknown session carries no charge risk.
            Logger.LogWarning(
                "[Webhook] Session not found for '{Provider}' / '{SessionId}' — recording {Outcome} as Ignored.",
                result.Provider, result.ProviderSessionId, result.Outcome);
            webhookEvent.MarkIgnored("session_not_found", Clock.Now);
            await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
            return;
        }

        // Out-of-order: a cancel/expire/fail arriving after the session already completed. The customer
        // paid; do not disturb the completed state.
        if (session.Status == OnlinePaymentSessionStatus.Completed)
        {
            Logger.LogInformation(
                "[Webhook] {Outcome} arrived for already-Completed session '{SessionId}' — recording Ignored.",
                result.Outcome, session.Id);
            webhookEvent.MarkIgnored("session_already_completed", Clock.Now, session.OrderId, session.Id);
            await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
            return;
        }

        // Already in a terminal non-completed state — idempotent no-op.
        if (session.Status != OnlinePaymentSessionStatus.Pending)
        {
            Logger.LogDebug(
                "[Webhook] Session '{SessionId}' already '{Status}' — recording {Outcome} as Ignored.",
                session.Id, session.Status, result.Outcome);
            webhookEvent.MarkIgnored($"session_already_{session.Status}".ToLowerInvariant(),
                Clock.Now, session.OrderId, session.Id);
            await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
            return;
        }

        // Session is Pending — apply the terminal status.
        switch (targetStatus)
        {
            case OnlinePaymentSessionStatus.Cancelled:
                session.MarkCancelled(result.ProviderEventId, result.RawProviderStatus);
                break;
            case OnlinePaymentSessionStatus.Expired:
                session.MarkExpired(result.ProviderEventId, result.RawProviderStatus);
                break;
            case OnlinePaymentSessionStatus.Failed:
                session.MarkFailed(result.ProviderPaymentId, result.ProviderEventId, result.RawProviderStatus);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(targetStatus), targetStatus,
                    "Unexpected terminal status in ProcessTerminalEventAsync.");
        }

        await _sessionRepository.UpdateAsync(session, autoSave: false);

        webhookEvent.MarkProcessed(session.OrderId, session.Id, Clock.Now);
        await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// <summary>
    /// Timeline wording. A legacy payment keeps its original single-amount sentence; a surcharged payment
    /// additionally states the surcharge and the total charged, so the audit trail never implies the
    /// commercial amount was what left the customer's card. Capped to the 512-char Description column.
    /// </summary>
    private static string BuildPaymentTimelineDescription(
        OnlinePaymentSession session,
        decimal              commercialAmount,
        string?              reference)
    {
        var text = $"Online payment of {commercialAmount:F2} {session.Currency} recorded via {session.Provider}.";

        if (session.SurchargeAmount > 0m)
        {
            text += $" Card processing surcharge {session.SurchargeAmount:F2} {session.Currency}; " +
                    $"total charged {session.Amount:F2} {session.Currency}.";
        }

        if (!string.IsNullOrEmpty(reference))
            text += $" Ref: {reference}.";

        return text.Length > 512 ? text[..509] + "..." : text;
    }

    /// <summary>
    /// Records a completed (charged) event that could not be tied to an actionable local session as
    /// RequiresManualReview, without touching any session. Used when there is no pending session to close.
    /// </summary>
    private async Task MarkEventManualReviewAsync(
        PaymentWebhookEvent   webhookEvent,
        string                rejectionCode,
        string                message,
        OnlinePaymentSession? session = null)
    {
        Logger.LogWarning(
            "[Webhook] Completed event '{EventId}' flagged for manual review: {Code} — {Message}.",
            webhookEvent.ProviderEventId, rejectionCode, message);

        webhookEvent.MarkRequiresManualReview(
            rejectionCode, message, Clock.Now, session?.OrderId, session?.Id);
        await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
    }

    /// <summary>
    /// Rejects a completed event against a Pending session: closes the session as Failed and records the
    /// event as RequiresManualReview (a completed event that the local system could not apply may still
    /// represent a real charge — surfaced for Jira 9810 reconciliation).
    /// </summary>
    private async Task RejectPendingCompletedAsync(
        PaymentWebhookEvent  webhookEvent,
        OnlinePaymentSession session,
        string               rejectionCode,
        string               message)
    {
        if (session.Status == OnlinePaymentSessionStatus.Pending)
        {
            session.MarkFailed(rawProviderStatus: rejectionCode);
            await _sessionRepository.UpdateAsync(session, autoSave: false);
        }

        Logger.LogWarning(
            "[Webhook] Completed event '{EventId}' rejected for session '{SessionId}': {Code} — {Message}. " +
            "Flagged for manual review.",
            webhookEvent.ProviderEventId, session.Id, rejectionCode, message);

        webhookEvent.MarkRequiresManualReview(
            rejectionCode, message, Clock.Now, session.OrderId, session.Id);
        await _webhookEventRepository.UpdateAsync(webhookEvent, autoSave: true);
    }

    private async Task<OnlinePaymentSession?> FindSessionAsync(
        PaymentProvider   provider,
        string            providerSessionId,
        CancellationToken cancellationToken)
    {
        var query = await _sessionRepository.GetQueryableAsync();
        return await query.FirstOrDefaultAsync(
            s => s.Provider == provider && s.ProviderSessionId == providerSessionId,
            cancellationToken);
    }

    private async Task AddTimelineEntryAsync(
        Guid           orderId,
        OrderEventType eventType,
        string         description,
        OrderStatus?   status = null)
    {
        var entry = new OrderTimelineEntry(
            GuidGenerator.Create(), orderId, eventType, description, status);
        await _timelineRepository.InsertAsync(entry, autoSave: true);
    }

    private static bool TryParseProvider(string value, out PaymentProvider provider)
        => Enum.TryParse(value, ignoreCase: true, out provider) && provider != PaymentProvider.None;

    /// <summary>
    /// Detects a unique-index violation from the event-registration insert without a hard dependency on
    /// the SQL client package. SQL Server surfaces unique/PK violations as error 2601/2627; other
    /// providers are covered by a duplicate-key message fallback.
    /// </summary>
    private static bool IsUniqueConstraintViolation(Exception exception)
    {
        for (var ex = exception; ex != null; ex = ex.InnerException)
        {
            if (ex.GetType().Name == "SqlException")
            {
                var numberProp = ex.GetType().GetProperty("Number");
                if (numberProp?.GetValue(ex) is int number && (number == 2601 || number == 2627))
                    return true;
            }

            if (ex.Message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }
}
