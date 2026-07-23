using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using TeeNova.Notifications;
using TeeNova.Orders;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;

namespace TeeNova.Email;

public class OrderEmailNotificationService : IOrderEmailNotificationService
{
    private readonly IEmailSettingsProvider                     _settingsProvider;
    private readonly IRepository<EmailNotificationLog, Guid>   _logRepository;
    private readonly IEmailDispatcher                          _dispatcher;
    private readonly IStagingEmailGuard                        _stagingGuard;
    private readonly IGuidGenerator                            _guidGenerator;
    private readonly ILogger<OrderEmailNotificationService>    _logger;

    public OrderEmailNotificationService(
        IEmailSettingsProvider                  settingsProvider,
        IRepository<EmailNotificationLog, Guid> logRepository,
        IEmailDispatcher                        dispatcher,
        IStagingEmailGuard                      stagingGuard,
        IGuidGenerator                          guidGenerator,
        ILogger<OrderEmailNotificationService>  logger)
    {
        _settingsProvider = settingsProvider;
        _logRepository    = logRepository;
        _dispatcher       = dispatcher;
        _stagingGuard     = stagingGuard;
        _guidGenerator    = guidGenerator;
        _logger           = logger;
    }

    public async Task SendOrderConfirmationAsync(Order order)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = order.CustomerEmail;
        var eventType = EmailEventTypes.CustomerOrderConfirmation;

        if (string.IsNullOrWhiteSpace(recipient))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: CustomerEmail is empty.",
                eventType, order.OrderNumber);
            return;
        }

        if (!IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: SMTP is not configured.",
                eventType, order.OrderNumber);
            return;
        }

        var (subject, htmlBody, textBody) = OrderEmailTemplates.BuildCustomerOrderConfirmation(order, settings);

        await SendWithLoggingAsync(order.Id, eventType, recipient, subject, htmlBody, textBody, settings);
    }

    public async Task SendAdminNewOrderNotificationAsync(Order order)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = settings.AdminNotificationEmail;
        var eventType = EmailEventTypes.AdminNewOrder;

        if (string.IsNullOrWhiteSpace(recipient))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: AdminNotificationEmail is not configured.",
                eventType, order.OrderNumber);
            return;
        }

        if (!IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: SMTP is not configured.",
                eventType, order.OrderNumber);
            return;
        }

        var (subject, htmlBody, textBody) = OrderEmailTemplates.BuildAdminNewOrderNotification(order, settings);

        await SendWithLoggingAsync(order.Id, eventType, recipient, subject, htmlBody, textBody, settings);
    }

    public async Task SendOrderReadyAsync(Order order)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = order.CustomerEmail;
        var eventType = EmailEventTypes.ReadyForPickup;

        if (string.IsNullOrWhiteSpace(recipient))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: CustomerEmail is empty.",
                eventType, order.OrderNumber);
            return;
        }

        if (!IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: SMTP is not configured.",
                eventType, order.OrderNumber);
            return;
        }

        var (subject, htmlBody, textBody) = OrderEmailTemplates.BuildOrderReadyEmail(order, settings);

        await SendWithLoggingAsync(order.Id, eventType, recipient, subject, htmlBody, textBody, settings);
    }

    public async Task SendOrderCompletedAsync(Order order)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = order.CustomerEmail;
        var eventType = EmailEventTypes.OrderCompleted;

        if (string.IsNullOrWhiteSpace(recipient))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: CustomerEmail is empty.",
                eventType, order.OrderNumber);
            return;
        }

        if (!IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: SMTP is not configured.",
                eventType, order.OrderNumber);
            return;
        }

        var (subject, htmlBody, textBody) = OrderEmailTemplates.BuildOrderCompletedEmail(order, settings);

        await SendWithLoggingAsync(order.Id, eventType, recipient, subject, htmlBody, textBody, settings);
    }

    public async Task SendPaymentReceiptAsync(Order order, PaymentTransaction transaction)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = order.CustomerEmail;
        var eventType = EmailEventTypes.PaymentRecorded;

        if (string.IsNullOrWhiteSpace(recipient))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: CustomerEmail is empty.",
                eventType, order.OrderNumber);
            return;
        }

        if (!IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for order {OrderNumber}: SMTP is not configured.",
                eventType, order.OrderNumber);
            return;
        }

        var (subject, htmlBody, textBody) = OrderEmailTemplates.BuildPaymentReceiptEmail(order, transaction, settings);

        await SendWithLoggingAsync(
            order.Id, eventType, recipient, subject, htmlBody, textBody, settings, transaction.Id);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task SendWithLoggingAsync(
        Guid                  orderId,
        string                eventType,
        string                recipient,
        string                subject,
        string                htmlBody,
        string                textBody,
        EmailSettingsSnapshot settings,
        Guid?                 paymentTransactionId = null)
    {
        // Idempotency check: a Sent record blocks resending.
        // Failed records do not block retry.
        if (await HasBeenSentAsync(orderId, eventType, recipient, paymentTransactionId))
        {
            _logger.LogInformation(
                "[Email] Duplicate skipped: {EventType} already sent for order {OrderId} to {Recipient}.",
                eventType, orderId, _stagingGuard.ForLog(recipient));
            return;
        }

        try
        {
            // Single guarded boundary: in staging mode this rewrites the recipient to an approved test
            // mailbox and decorates the message; in production it is a faithful passthrough.
            await _dispatcher.DispatchAsync(settings, recipient, subject, htmlBody, textBody);

            _logger.LogInformation(
                "[Email] Sent {EventType} for order {OrderId} to {Recipient}.",
                eventType, orderId, _stagingGuard.ForLog(recipient));

            await WriteLogAsync(EmailNotificationLog.Sent(
                _guidGenerator.Create(), orderId, eventType, recipient, subject, paymentTransactionId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "[Email] Failed to send {EventType} for order {OrderId} to {Recipient}.",
                eventType, orderId, _stagingGuard.ForLog(recipient));

            await WriteLogAsync(EmailNotificationLog.Failed(
                _guidGenerator.Create(), orderId, eventType, recipient, subject, ex.Message, paymentTransactionId));
        }
    }

    private async Task<bool> HasBeenSentAsync(
        Guid   orderId,
        string eventType,
        string recipient,
        Guid?  paymentTransactionId = null)
    {
        try
        {
            var exists = await _logRepository.AnyAsync(e =>
                e.OrderId              == orderId              &&
                e.EventType            == eventType            &&
                e.Recipient            == recipient            &&
                e.PaymentTransactionId == paymentTransactionId &&
                e.Status               == EmailSendStatus.Sent);

            return exists;
        }
        catch (Exception ex)
        {
            // Idempotency check failure: log and allow the send attempt to proceed.
            _logger.LogError(ex,
                "[Email] Idempotency check failed for {EventType} / order {OrderId}. Proceeding with send.",
                eventType, orderId);
            return false;
        }
    }

    private async Task WriteLogAsync(EmailNotificationLog log)
    {
        try
        {
            await _logRepository.InsertAsync(log, autoSave: true);
        }
        catch (Exception ex)
        {
            // Log write failure must not propagate — idempotency may be impaired for this event.
            _logger.LogError(ex,
                "[Email] Failed to write EmailNotificationLog for order {OrderId} / {EventType}.",
                log.OrderId, log.EventType);
        }
    }

    private static bool IsSmtpConfigured(EmailSettingsSnapshot settings)
        => !string.IsNullOrWhiteSpace(settings.Smtp.Host) &&
           !string.IsNullOrWhiteSpace(settings.SenderAddress);
}
