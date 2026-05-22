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

namespace TeeNova.Payments;

public class OnlinePaymentWebhookAppService : ApplicationService, IOnlinePaymentWebhookAppService
{
    private readonly IOnlinePaymentProviderResolver          _providerResolver;
    private readonly IRepository<OnlinePaymentSession, Guid> _sessionRepository;
    private readonly IRepository<Order, Guid>                _orderRepository;
    private readonly IRepository<PaymentTransaction, Guid>   _transactionRepository;
    private readonly IRepository<OrderTimelineEntry, Guid>   _timelineRepository;
    private readonly IOrderEmailNotificationService          _emailService;

    public OnlinePaymentWebhookAppService(
        IOnlinePaymentProviderResolver          providerResolver,
        IRepository<OnlinePaymentSession, Guid> sessionRepository,
        IRepository<Order, Guid>                orderRepository,
        IRepository<PaymentTransaction, Guid>   transactionRepository,
        IRepository<OrderTimelineEntry, Guid>   timelineRepository,
        IOrderEmailNotificationService          emailService)
    {
        _providerResolver      = providerResolver;
        _sessionRepository     = sessionRepository;
        _orderRepository       = orderRepository;
        _transactionRepository = transactionRepository;
        _timelineRepository    = timelineRepository;
        _emailService          = emailService;
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

        switch (result.Outcome)
        {
            case OnlinePaymentWebhookOutcome.Ignored:
                Logger.LogDebug("[Webhook] Provider '{Provider}' returned Ignored — no action.", paymentProvider);
                return;

            case OnlinePaymentWebhookOutcome.PaymentCompleted:
                await ProcessPaymentCompletedAsync(result, cancellationToken);
                break;

            case OnlinePaymentWebhookOutcome.PaymentCancelled:
                await UpdateSessionTerminalStatusAsync(result, OnlinePaymentSessionStatus.Cancelled, cancellationToken);
                break;

            case OnlinePaymentWebhookOutcome.PaymentExpired:
                await UpdateSessionTerminalStatusAsync(result, OnlinePaymentSessionStatus.Expired, cancellationToken);
                break;

            case OnlinePaymentWebhookOutcome.PaymentFailed:
                await UpdateSessionTerminalStatusAsync(result, OnlinePaymentSessionStatus.Failed, cancellationToken);
                break;

            default:
                Logger.LogWarning(
                    "[Webhook] Unhandled outcome '{Outcome}' from provider '{Provider}' — ignoring.",
                    result.Outcome, paymentProvider);
                break;
        }
    }

    // ── PaymentCompleted ──────────────────────────────────────────────────────

    private async Task ProcessPaymentCompletedAsync(
        OnlinePaymentWebhookResult result,
        CancellationToken          cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(result.ProviderSessionId))
            throw new BusinessException("TeeNova:Payment:WebhookMissingProviderSessionId")
                .WithData("Provider", result.Provider);

        var session = await FindSessionAsync(result.Provider, result.ProviderSessionId, cancellationToken);

        if (session == null)
            throw new BusinessException("TeeNova:Payment:WebhookSessionNotFound")
                .WithData("Provider", result.Provider)
                .WithData("ProviderSessionId", result.ProviderSessionId);

        // Idempotency: already processed — return success without re-recording.
        if (session.Status == OnlinePaymentSessionStatus.Completed || session.PaymentTransactionId.HasValue)
        {
            Logger.LogInformation(
                "[Webhook] Session '{SessionId}' is already Completed — returning idempotent success.",
                session.Id);
            return;
        }

        if (session.Status != OnlinePaymentSessionStatus.Pending)
            throw new BusinessException("TeeNova:Payment:WebhookSessionNotActionable")
                .WithData("SessionId", session.Id)
                .WithData("Status", session.Status);

        // Amount/currency validation.
        if (!result.Amount.HasValue)
            throw new BusinessException("TeeNova:Payment:WebhookMissingAmount")
                .WithData("SessionId", session.Id);

        if (result.Amount.Value != session.Amount)
        {
            Logger.LogWarning(
                "[Webhook] Amount mismatch for session '{SessionId}': webhook={WebhookAmount} session={SessionAmount}.",
                session.Id, result.Amount.Value, session.Amount);
            throw new BusinessException("TeeNova:Payment:WebhookAmountMismatch")
                .WithData("SessionId", session.Id)
                .WithData("WebhookAmount", result.Amount.Value)
                .WithData("SessionAmount", session.Amount);
        }

        if (string.IsNullOrWhiteSpace(result.Currency)
            || !string.Equals(result.Currency, session.Currency, StringComparison.OrdinalIgnoreCase))
        {
            Logger.LogWarning(
                "[Webhook] Currency mismatch for session '{SessionId}': webhook={WebhookCurrency} session={SessionCurrency}.",
                session.Id, result.Currency, session.Currency);
            throw new BusinessException("TeeNova:Payment:WebhookCurrencyMismatch")
                .WithData("SessionId", session.Id)
                .WithData("WebhookCurrency", result.Currency ?? "(null)")
                .WithData("SessionCurrency", session.Currency);
        }

        // Load and validate the order.
        var order = await _orderRepository.FindAsync(session.OrderId);

        if (order == null)
            throw new BusinessException("TeeNova:Payment:WebhookOrderNotFound")
                .WithData("OrderId", session.OrderId)
                .WithData("SessionId", session.Id);

        if (order.Status == OrderStatus.Cancelled)
            throw new BusinessException("TeeNova:Payment:WebhookOrderCancelled")
                .WithData("OrderId", order.Id)
                .WithData("SessionId", session.Id);

        if (order.Status == OrderStatus.Completed)
            throw new BusinessException("TeeNova:Payment:WebhookOrderCompleted")
                .WithData("OrderId", order.Id)
                .WithData("SessionId", session.Id);

        if (order.BalanceAmount <= 0)
            throw new BusinessException("TeeNova:Payment:WebhookNoBalanceDue")
                .WithData("OrderId", order.Id)
                .WithData("BalanceAmount", order.BalanceAmount);

        if (session.Amount > order.BalanceAmount)
        {
            Logger.LogWarning(
                "[Webhook] Overpayment for order '{OrderId}': session amount {Amount} > balance {Balance}.",
                order.Id, session.Amount, order.BalanceAmount);
            throw new BusinessException("TeeNova:Payment:WebhookOverpayment")
                .WithData("OrderId", order.Id)
                .WithData("SessionAmount", session.Amount)
                .WithData("BalanceAmount", order.BalanceAmount);
        }

        // Record the payment — follow the same sequence as RecordPaymentAsync.
        var reference = result.ProviderPaymentId ?? session.ProviderSessionId;
        var note      = $"Online payment via {session.Provider}.";

        order.ApplyPayment(session.Amount, ManualPaymentMethod.Online, reference, note, Clock.Now);

        var transaction = new PaymentTransaction(
            GuidGenerator.Create(),
            order.Id,
            session.Amount,
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

        await _sessionRepository.UpdateAsync(session, autoSave: true);

        var timelineDesc = string.IsNullOrEmpty(reference)
            ? $"Online payment of {session.Amount:C} recorded via {session.Provider}."
            : $"Online payment of {session.Amount:C} recorded via {session.Provider}. Ref: {reference}.";

        await AddTimelineEntryAsync(order.Id, OrderEventType.PaymentReceived, timelineDesc, order.Status);

        // Receipt email — best-effort, must not block payment recording or webhook response.
        try
        {
            await _emailService.SendPaymentReceiptAsync(order, transaction);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Failed to send payment receipt for order {OrderNumber} after online payment webhook.",
                order.OrderNumber);
        }
    }

    // ── Cancelled / Expired / Failed ──────────────────────────────────────────

    private async Task UpdateSessionTerminalStatusAsync(
        OnlinePaymentWebhookResult result,
        OnlinePaymentSessionStatus targetStatus,
        CancellationToken          cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(result.ProviderSessionId))
        {
            Logger.LogWarning(
                "[Webhook] Provider '{Provider}' outcome '{Outcome}' has no ProviderSessionId — ignoring.",
                result.Provider, result.Outcome);
            return;
        }

        var session = await FindSessionAsync(result.Provider, result.ProviderSessionId, cancellationToken);

        if (session == null)
        {
            Logger.LogWarning(
                "[Webhook] Session not found for provider '{Provider}' / ProviderSessionId '{SessionId}' — ignoring {Outcome}.",
                result.Provider, result.ProviderSessionId, result.Outcome);
            return;
        }

        if (session.Status != OnlinePaymentSessionStatus.Pending)
        {
            Logger.LogDebug(
                "[Webhook] Session '{SessionId}' already in terminal state '{Status}' — ignoring {Outcome}.",
                session.Id, session.Status, result.Outcome);
            return;
        }

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
                    "Unexpected terminal status in UpdateSessionTerminalStatusAsync.");
        }

        await _sessionRepository.UpdateAsync(session, autoSave: true);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
}
