using System;
using System.Linq;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using MimeKit;
using TeeNova.Notifications;
using TeeNova.Orders;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;

namespace TeeNova.Email;

public class OrderEmailNotificationService : IOrderEmailNotificationService
{
    private readonly IEmailSettingsProvider                     _settingsProvider;
    private readonly IRepository<EmailNotificationLog, Guid>   _logRepository;
    private readonly IGuidGenerator                            _guidGenerator;
    private readonly ILogger<OrderEmailNotificationService>    _logger;

    public OrderEmailNotificationService(
        IEmailSettingsProvider                  settingsProvider,
        IRepository<EmailNotificationLog, Guid> logRepository,
        IGuidGenerator                          guidGenerator,
        ILogger<OrderEmailNotificationService>  logger)
    {
        _settingsProvider = settingsProvider;
        _logRepository    = logRepository;
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

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task SendWithLoggingAsync(
        Guid                  orderId,
        string                eventType,
        string                recipient,
        string                subject,
        string                htmlBody,
        string                textBody,
        EmailSettingsSnapshot settings)
    {
        // Idempotency check: a Sent record blocks resending.
        // Failed records do not block retry.
        if (await HasBeenSentAsync(orderId, eventType, recipient))
        {
            _logger.LogInformation(
                "[Email] Duplicate skipped: {EventType} already sent for order {OrderId} to {Recipient}.",
                eventType, orderId, recipient);
            return;
        }

        try
        {
            await SendSmtpAsync(recipient, subject, htmlBody, textBody, settings);

            _logger.LogInformation(
                "[Email] Sent {EventType} for order {OrderId} to {Recipient}.",
                eventType, orderId, recipient);

            await WriteLogAsync(EmailNotificationLog.Sent(
                _guidGenerator.Create(), orderId, eventType, recipient, subject));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "[Email] Failed to send {EventType} for order {OrderId} to {Recipient}.",
                eventType, orderId, recipient);

            await WriteLogAsync(EmailNotificationLog.Failed(
                _guidGenerator.Create(), orderId, eventType, recipient, subject, ex.Message));
        }
    }

    private async Task<bool> HasBeenSentAsync(Guid orderId, string eventType, string recipient)
    {
        try
        {
            var exists = await _logRepository.AnyAsync(e =>
                e.OrderId   == orderId   &&
                e.EventType == eventType &&
                e.Recipient == recipient &&
                e.Status    == EmailSendStatus.Sent);

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

    private static async Task SendSmtpAsync(
        string                recipient,
        string                subject,
        string                htmlBody,
        string                textBody,
        EmailSettingsSnapshot settings)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(settings.SenderName, settings.SenderAddress));
        message.To.Add(MailboxAddress.Parse(recipient));

        if (!string.IsNullOrWhiteSpace(settings.ReplyToAddress))
            message.ReplyTo.Add(MailboxAddress.Parse(settings.ReplyToAddress));

        message.Subject = subject;

        var body = new BodyBuilder
        {
            HtmlBody = htmlBody,
            TextBody = textBody,
        };
        message.Body = body.ToMessageBody();

        using var smtp = new SmtpClient();

        var secureOption = settings.Smtp.EnableSsl
            ? SecureSocketOptions.StartTls
            : SecureSocketOptions.None;

        await smtp.ConnectAsync(settings.Smtp.Host, settings.Smtp.Port, secureOption);

        if (!string.IsNullOrWhiteSpace(settings.Smtp.UserName))
            await smtp.AuthenticateAsync(settings.Smtp.UserName, settings.Smtp.Password);

        await smtp.SendAsync(message);
        await smtp.DisconnectAsync(quit: true);
    }

    private static bool IsSmtpConfigured(EmailSettingsSnapshot settings)
        => !string.IsNullOrWhiteSpace(settings.Smtp.Host) &&
           !string.IsNullOrWhiteSpace(settings.SenderAddress);
}
