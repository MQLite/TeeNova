using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using MimeKit;
using TeeNova.Enquiries;
using TeeNova.Notifications;
using TeeNova.Orders;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;

namespace TeeNova.Email;

/// <summary>
/// Sends Banner quote enquiry emails (Jira 9513): an admin notification on a new enquiry and a customer
/// acknowledgement. Self-contained on purpose — it reuses the shared email settings/SMTP/log primitives
/// but does NOT touch <see cref="OrderEmailNotificationService"/> (no regression risk to garment/Badge
/// order emails). All sends are best-effort and never throw to the caller. The customer email contains
/// NO payment link and never implies the order is paid or confirmed for production.
///
/// Idempotency/audit reuse the <see cref="EmailNotificationLog"/> table, keying its <c>OrderId</c> column
/// on the BannerQuoteRequest id (the related entity for these events).
/// </summary>
public interface IBannerEnquiryEmailService
{
    Task SendAdminNewEnquiryNotificationAsync(BannerQuoteRequest request);
    Task SendCustomerAcknowledgementAsync(BannerQuoteRequest request);
}

public class BannerEnquiryEmailService : IBannerEnquiryEmailService, ITransientDependency
{
    private readonly IEmailSettingsProvider                   _settingsProvider;
    private readonly IRepository<EmailNotificationLog, Guid>  _logRepository;
    private readonly IGuidGenerator                           _guidGenerator;
    private readonly ILogger<BannerEnquiryEmailService>       _logger;

    public BannerEnquiryEmailService(
        IEmailSettingsProvider                  settingsProvider,
        IRepository<EmailNotificationLog, Guid> logRepository,
        IGuidGenerator                          guidGenerator,
        ILogger<BannerEnquiryEmailService>      logger)
    {
        _settingsProvider = settingsProvider;
        _logRepository    = logRepository;
        _guidGenerator    = guidGenerator;
        _logger           = logger;
    }

    public async Task SendAdminNewEnquiryNotificationAsync(BannerQuoteRequest request)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = settings.AdminNotificationEmail;
        const string eventType = EmailEventTypes.AdminNewBannerEnquiry;

        if (string.IsNullOrWhiteSpace(recipient) || !IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for banner enquiry {Id}: admin recipient or SMTP not configured.",
                eventType, request.Id);
            return;
        }

        var (subject, html, text) = BannerEnquiryEmailTemplates.BuildAdminNotification(request, settings);
        await SendWithLoggingAsync(request.Id, eventType, recipient, subject, html, text, settings);
    }

    public async Task SendCustomerAcknowledgementAsync(BannerQuoteRequest request)
    {
        var settings  = await _settingsProvider.GetEffectiveSettingsAsync();
        var recipient = request.CustomerEmail;
        const string eventType = EmailEventTypes.CustomerBannerEnquiryAcknowledgement;

        if (string.IsNullOrWhiteSpace(recipient) || !IsSmtpConfigured(settings))
        {
            _logger.LogWarning(
                "[Email] Skipping {EventType} for banner enquiry {Id}: recipient or SMTP not configured.",
                eventType, request.Id);
            return;
        }

        var (subject, html, text) = BannerEnquiryEmailTemplates.BuildCustomerAcknowledgement(request, settings);
        await SendWithLoggingAsync(request.Id, eventType, recipient, subject, html, text, settings);
    }

    private async Task SendWithLoggingAsync(
        Guid relatedId, string eventType, string recipient,
        string subject, string htmlBody, string textBody, EmailSettingsSnapshot settings)
    {
        if (await HasBeenSentAsync(relatedId, eventType, recipient))
        {
            _logger.LogInformation(
                "[Email] Duplicate skipped: {EventType} already sent for banner enquiry {Id} to {Recipient}.",
                eventType, relatedId, recipient);
            return;
        }

        try
        {
            await SendSmtpAsync(recipient, subject, htmlBody, textBody, settings);
            _logger.LogInformation("[Email] Sent {EventType} for banner enquiry {Id}.", eventType, relatedId);
            await WriteLogAsync(EmailNotificationLog.Sent(
                _guidGenerator.Create(), relatedId, eventType, recipient, subject));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Email] Failed to send {EventType} for banner enquiry {Id}.", eventType, relatedId);
            await WriteLogAsync(EmailNotificationLog.Failed(
                _guidGenerator.Create(), relatedId, eventType, recipient, subject, ex.Message));
        }
    }

    private async Task<bool> HasBeenSentAsync(Guid relatedId, string eventType, string recipient)
    {
        try
        {
            return await _logRepository.AnyAsync(e =>
                e.OrderId   == relatedId &&
                e.EventType == eventType &&
                e.Recipient == recipient &&
                e.Status    == EmailSendStatus.Sent);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Email] Idempotency check failed for {EventType} / enquiry {Id}.", eventType, relatedId);
            return false;
        }
    }

    private async Task WriteLogAsync(EmailNotificationLog log)
    {
        try { await _logRepository.InsertAsync(log, autoSave: true); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Email] Failed to write EmailNotificationLog for enquiry {Id} / {EventType}.",
                log.OrderId, log.EventType);
        }
    }

    private static async Task SendSmtpAsync(
        string recipient, string subject, string htmlBody, string textBody, EmailSettingsSnapshot settings)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(settings.SenderName, settings.SenderAddress));
        message.To.Add(MailboxAddress.Parse(recipient));
        if (!string.IsNullOrWhiteSpace(settings.ReplyToAddress))
            message.ReplyTo.Add(MailboxAddress.Parse(settings.ReplyToAddress));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();

        using var smtp = new SmtpClient();
        var secureOption = settings.Smtp.EnableSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.None;
        await smtp.ConnectAsync(settings.Smtp.Host, settings.Smtp.Port, secureOption);
        if (!string.IsNullOrWhiteSpace(settings.Smtp.UserName))
            await smtp.AuthenticateAsync(settings.Smtp.UserName, settings.Smtp.Password);
        await smtp.SendAsync(message);
        await smtp.DisconnectAsync(quit: true);
    }

    private static bool IsSmtpConfigured(EmailSettingsSnapshot settings)
        => !string.IsNullOrWhiteSpace(settings.Smtp.Host) && !string.IsNullOrWhiteSpace(settings.SenderAddress);
}

/// <summary>HTML/text builders for Banner enquiry emails (Jira 9513). No price, no payment link.</summary>
public static class BannerEnquiryEmailTemplates
{
    public static (string subject, string html, string text) BuildAdminNotification(
        BannerQuoteRequest r, EmailSettingsSnapshot settings)
    {
        var subject = $"New banner quote request — {r.ProductNameSnapshot}";
        var rows = ConfigRows(r);
        rows.Insert(0, ("Customer", $"{r.CustomerName} ({r.CustomerEmail}{(string.IsNullOrWhiteSpace(r.CustomerPhone) ? "" : $", {r.CustomerPhone}")})"));
        if (!string.IsNullOrWhiteSpace(r.Message)) rows.Add(("Message", r.Message!));

        var reviewLink = BuildReviewLink(settings, r.Id);
        var htmlExtra = reviewLink == null
            ? ""
            : $"<p style=\"margin:16px 0\"><a href=\"{Enc(reviewLink)}\">Review this enquiry in admin</a></p>";
        var textExtra = reviewLink == null ? "" : $"\nReview: {reviewLink}";

        var html = Wrap(
            "New banner quote request",
            $"<p>A customer submitted a banner quote request. No payment has been taken.</p>{Table(rows)}{htmlExtra}");
        var text = $"New banner quote request\n\n{TextRows(rows)}{textExtra}\n";
        return (subject, html, text);
    }

    public static (string subject, string html, string text) BuildCustomerAcknowledgement(
        BannerQuoteRequest r, EmailSettingsSnapshot settings)
    {
        var subject = $"We received your banner quote request — {r.ProductNameSnapshot}";
        var rows = ConfigRows(r);
        rows.Insert(0, ("Quantity", r.Quantity.ToString()));
        var designLine = r.UploadedAssetId != null || !string.IsNullOrWhiteSpace(r.UploadedAssetUrl)
            ? "Design received: yes"
            : "Design received: no";

        var body =
            $"<p>Hi {Enc(r.CustomerName)},</p>" +
            $"<p>Thanks for your banner quote request for <strong>{Enc(r.ProductNameSnapshot)}</strong>. " +
            "We’ll review your requirements and <strong>confirm the price before any payment</strong> — " +
            "no payment has been taken and your order is not yet confirmed for production.</p>" +
            Table(rows) +
            $"<p style=\"margin-top:12px\">{Enc(designLine)}</p>" +
            (string.IsNullOrWhiteSpace(settings.ShopContactInfo)
                ? ""
                : $"<p style=\"color:#666\">{Enc(settings.ShopContactInfo)}</p>");

        var html = Wrap("Banner quote request received", body);
        var text =
            $"Hi {r.CustomerName},\n\n" +
            $"Thanks for your banner quote request for {r.ProductNameSnapshot}. " +
            "We'll review your requirements and confirm the price before any payment. " +
            "No payment has been taken and your order is not yet confirmed for production.\n\n" +
            $"{TextRows(rows)}\n{designLine}\n" +
            (string.IsNullOrWhiteSpace(settings.ShopContactInfo) ? "" : $"\n{settings.ShopContactInfo}\n");
        return (subject, html, text);
    }

    // ── Shared formatting ────────────────────────────────────────────────────────

    private static List<(string, string)> ConfigRows(BannerQuoteRequest r)
    {
        var rows = new List<(string, string)>
        {
            ("Product", r.ProductNameSnapshot),
            ("Size", SizeSummary(r)),
            ("Material", r.Material == BannerMaterial.Other && !string.IsNullOrWhiteSpace(r.MaterialDisplayName)
                ? r.MaterialDisplayName!
                : r.Material.ToString()),
        };
        var finishing = Finishing(r);
        if (finishing.Length > 0) rows.Add(("Finishing", finishing));
        if (!string.IsNullOrWhiteSpace(r.DesignNote)) rows.Add(("Design note", r.DesignNote!));
        if (!string.IsNullOrWhiteSpace(r.BannerNotes)) rows.Add(("Notes", r.BannerNotes!));
        return rows;
    }

    private static string SizeSummary(BannerQuoteRequest r)
    {
        if (r.SizeMode == BannerSizeMode.Custom && r.Width is > 0 && r.Height is > 0)
        {
            var unit = r.Unit?.ToString().ToLowerInvariant() ?? "";
            var area = r.AreaSquareMetres != null ? $" ({r.AreaSquareMetres} m²)" : "";
            return $"{r.Width}×{r.Height} {unit}{area}".Trim();
        }
        return string.IsNullOrWhiteSpace(r.SizeLabel) ? "—" : r.SizeLabel!;
    }

    private static string Finishing(BannerQuoteRequest r)
    {
        var parts = new List<string>();
        if (r.FinishingEyelets) parts.Add("Eyelets");
        if (r.FinishingHemming) parts.Add("Hemming");
        if (r.FinishingPolePocket) parts.Add("Pole pocket");
        if (r.StandIncluded) parts.Add("Stand included");
        if (r.StandReplacementOnly) parts.Add("Stand replacement only");
        if (!string.IsNullOrWhiteSpace(r.FinishingOther)) parts.Add(r.FinishingOther!);
        return string.Join(", ", parts);
    }

    private static string? BuildReviewLink(EmailSettingsSnapshot settings, Guid id)
    {
        if (string.IsNullOrWhiteSpace(settings.AdminOrderBaseUrl)) return null;
        // AdminOrderBaseUrl points at the admin order area; derive the admin origin and link to enquiries.
        try
        {
            var uri = new Uri(settings.AdminOrderBaseUrl);
            return $"{uri.Scheme}://{uri.Authority}/admin/banner-enquiries/{id}";
        }
        catch { return null; }
    }

    private static string Table(IEnumerable<(string label, string value)> rows)
    {
        var cells = string.Join("", rows.Select(r =>
            $"<tr><td style=\"padding:4px 12px 4px 0;color:#666;vertical-align:top\">{Enc(r.label)}</td>" +
            $"<td style=\"padding:4px 0\">{Enc(r.value)}</td></tr>"));
        return $"<table style=\"border-collapse:collapse;font-size:14px\">{cells}</table>";
    }

    private static string TextRows(IEnumerable<(string label, string value)> rows)
        => string.Join("\n", rows.Select(r => $"{r.label}: {r.value}"));

    private static string Wrap(string heading, string bodyHtml)
        => $"<div style=\"font-family:Arial,sans-serif;color:#111;max-width:560px\">" +
           $"<h2 style=\"font-size:18px\">{Enc(heading)}</h2>{bodyHtml}</div>";

    private static string Enc(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);
}
