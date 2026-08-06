using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using TeeNova.Enquiries;
using TeeNova.Notifications;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;

namespace TeeNova.Email;

public interface IQuoteRequestEmailService
{
    Task<bool> SendInternalAsync(QuoteRequest request, CancellationToken cancellationToken = default);
    Task<bool> SendCustomerAcknowledgementAsync(QuoteRequest request, CancellationToken cancellationToken = default);
}

public sealed class QuoteRequestEmailService : IQuoteRequestEmailService, ITransientDependency
{
    private readonly IEmailSettingsProvider _settings;
    private readonly IRepository<EmailNotificationLog, Guid> _logs;
    private readonly IEmailDispatcher _dispatcher;
    private readonly IGuidGenerator _guids;

    public QuoteRequestEmailService(IEmailSettingsProvider settings,
        IRepository<EmailNotificationLog, Guid> logs, IEmailDispatcher dispatcher, IGuidGenerator guids)
    {
        _settings = settings;
        _logs = logs;
        _dispatcher = dispatcher;
        _guids = guids;
    }

    public async Task<bool> SendInternalAsync(QuoteRequest request, CancellationToken cancellationToken = default)
    {
        var settings = await _settings.GetEffectiveSettingsAsync();
        var recipient = settings.QuoteNotificationEmail;
        var (subject, html, text) = QuoteRequestEmailTemplates.Internal(request, settings);
        return await SendAsync(request.Id, EmailEventTypes.AdminNewQuoteRequest, recipient, subject, html, text, settings, cancellationToken);
    }

    public async Task<bool> SendCustomerAcknowledgementAsync(QuoteRequest request, CancellationToken cancellationToken = default)
    {
        var settings = await _settings.GetEffectiveSettingsAsync();
        var (subject, html, text) = QuoteRequestEmailTemplates.Customer(request, settings);
        return await SendAsync(request.Id, EmailEventTypes.CustomerQuoteRequestAcknowledgement,
            request.CustomerEmail, subject, html, text, settings, cancellationToken);
    }

    private async Task<bool> SendAsync(Guid id, string eventType, string recipient, string subject,
        string html, string text, EmailSettingsSnapshot settings, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(recipient) || string.IsNullOrWhiteSpace(settings.Smtp.Host) ||
            string.IsNullOrWhiteSpace(settings.SenderAddress)) return false;
        if (await _logs.AnyAsync(x => x.OrderId == id && x.EventType == eventType &&
                                     x.Recipient == recipient && x.Status == EmailSendStatus.Sent,
                cancellationToken: cancellationToken)) return true;
        try
        {
            var effectiveSettings = settings;
            if (eventType == EmailEventTypes.AdminNewQuoteRequest && !string.IsNullOrWhiteSpace(settings.QuoteReplyToAddress))
                effectiveSettings = CopyWithReplyTo(settings, settings.QuoteReplyToAddress);
            await _dispatcher.DispatchAsync(effectiveSettings, recipient, subject, html, text, cancellationToken);
            await _logs.InsertAsync(EmailNotificationLog.Sent(_guids.Create(), id, eventType, recipient, subject),
                autoSave: true, cancellationToken: cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            await _logs.InsertAsync(EmailNotificationLog.Failed(_guids.Create(), id, eventType, recipient, subject, ex.Message),
                autoSave: true, cancellationToken: CancellationToken.None);
            return false;
        }
    }

    private static EmailSettingsSnapshot CopyWithReplyTo(EmailSettingsSnapshot s, string replyTo) => new()
    {
        Smtp = s.Smtp, SenderName = s.SenderName, SenderAddress = s.SenderAddress,
        ReplyToAddress = replyTo, AdminNotificationEmail = s.AdminNotificationEmail,
        QuoteNotificationEmail = s.QuoteNotificationEmail, QuoteReplyToAddress = s.QuoteReplyToAddress,
        ShopContactInfo = s.ShopContactInfo, AdminOrderBaseUrl = s.AdminOrderBaseUrl,
    };
}

public static class QuoteRequestEmailTemplates
{
    public static (string subject, string html, string text) Internal(QuoteRequest r, EmailSettingsSnapshot settings)
    {
        var rows = Rows(r, includeCustomer: true);
        var link = AdminLink(settings.AdminOrderBaseUrl, r.Id);
        if (link is not null) rows.Add(("Admin", link));
        return ($"New quote request {r.Reference}", Html("New quote request", rows,
            "A customer submitted a quote request. No price has been promised and no payment has been taken."),
            Text(rows, "A customer submitted a quote request. No price has been promised and no payment has been taken."));
    }

    public static (string subject, string html, string text) Customer(QuoteRequest r, EmailSettingsSnapshot settings)
    {
        var rows = Rows(r, includeCustomer: false);
        var intro = $"Hi {r.CustomerName}, thanks for your quote request. Your reference is {r.Reference}. " +
                    "We will review the details and confirm any price before payment. No payment has been taken.";
        return ($"We received your quote request {r.Reference}", Html("Quote request received", rows, intro), Text(rows, intro));
    }

    private static List<(string label, string value)> Rows(QuoteRequest r, bool includeCustomer)
    {
        var rows = new List<(string, string)> { ("Reference", r.Reference), ("Service", r.ServiceType == QuoteServiceType.Other ? r.ServiceTypeOther ?? "Other" : r.ServiceType.ToString()) };
        if (includeCustomer) rows.Add(("Customer", $"{r.CustomerName} ({r.CustomerEmail}{(r.CustomerPhone is null ? "" : $", {r.CustomerPhone}")})"));
        if (r.Quantity.HasValue) rows.Add(("Quantity", r.Quantity.Value.ToString()));
        if (r.Width.HasValue && r.Height.HasValue) rows.Add(("Dimensions", $"{r.Width} x {r.Height} {r.DimensionUnit}"));
        if (r.RequiredDate.HasValue) rows.Add(("Required date", r.RequiredDate.Value.ToString("yyyy-MM-dd")));
        rows.Add(("Fulfilment", r.FulfilmentPreference.ToString()));
        if (!string.IsNullOrWhiteSpace(r.DeliverySuburb)) rows.Add(("Delivery suburb", r.DeliverySuburb!));
        if (!string.IsNullOrWhiteSpace(r.Notes)) rows.Add(("Notes", r.Notes!));
        rows.Add(("Attachments", r.Attachments.Count.ToString()));
        return rows;
    }

    private static string Html(string heading, IEnumerable<(string label, string value)> rows, string intro)
        => $"<div style=\"font-family:Arial,sans-serif;color:#111;max-width:600px\"><h2>{Enc(heading)}</h2><p>{Enc(intro)}</p><table>{string.Join("", rows.Select(x => $"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">{Enc(x.label)}</td><td>{Enc(x.value)}</td></tr>"))}</table></div>";
    private static string Text(IEnumerable<(string label, string value)> rows, string intro)
        => intro + "\n\n" + string.Join("\n", rows.Select(x => $"{x.label}: {x.value}"));
    private static string Enc(string value) => WebUtility.HtmlEncode(value);
    private static string? AdminLink(string baseUrl, Guid id)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri)) return null;
        return $"{uri.Scheme}://{uri.Authority}/admin/quote-requests/{id}";
    }
}
