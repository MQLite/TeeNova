using System;
using System.Threading;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Email;

/// <summary>
/// Thrown when the staging guard blocks a send (fail-closed): staging mode is on but no approved test
/// recipient is configured. Callers treat this like any other send failure (logged as Failed, never
/// as Sent), and the original customer recipient is never used. The message is recipient-free.
/// </summary>
public sealed class StagingEmailBlockedException : BusinessException
{
    public StagingEmailBlockedException(string reason)
        : base(code: "TeeNova:Email:StagingSendBlocked", message: reason) { }
}

/// <summary>
/// The single outbound-email boundary (Jira 9908.2). Every application email path routes through here,
/// so the staging guard cannot be bypassed. It applies <see cref="IStagingEmailGuard"/>, then performs
/// the SMTP transport (formerly duplicated in each email service). CC/BCC are never set.
/// </summary>
public interface IEmailDispatcher
{
    Task DispatchAsync(
        EmailSettingsSnapshot settings,
        string                recipient,
        string                subject,
        string                htmlBody,
        string                textBody,
        CancellationToken     cancellationToken = default);
}

/// <inheritdoc />
public sealed class EmailDispatcher : IEmailDispatcher, ITransientDependency
{
    private readonly IStagingEmailGuard _guard;

    public EmailDispatcher(IStagingEmailGuard guard)
    {
        _guard = guard;
    }

    public async Task DispatchAsync(
        EmailSettingsSnapshot settings,
        string                recipient,
        string                subject,
        string                htmlBody,
        string                textBody,
        CancellationToken     cancellationToken = default)
    {
        var decision = _guard.Apply(
            recipient, subject, htmlBody, textBody,
            settings.SenderName, settings.SenderAddress, settings.ReplyToAddress);

        if (decision.Blocked || decision.Email is null)
            throw new StagingEmailBlockedException(decision.BlockReason ?? "Staging email send blocked.");

        var e = decision.Email;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(e.SenderName, e.SenderAddress));
        message.To.Add(MailboxAddress.Parse(e.Recipient));

        // CC/BCC are deliberately never carried — no customer CC/BCC can leak from a cloned staging DB.
        if (!string.IsNullOrWhiteSpace(e.ReplyTo))
            message.ReplyTo.Add(MailboxAddress.Parse(e.ReplyTo));

        message.Subject = e.Subject;
        message.Body = new BodyBuilder { HtmlBody = e.HtmlBody, TextBody = e.TextBody }.ToMessageBody();

        using var smtp = new SmtpClient();
        var secureOption = settings.Smtp.EnableSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.None;

        await smtp.ConnectAsync(settings.Smtp.Host, settings.Smtp.Port, secureOption, cancellationToken);

        if (!string.IsNullOrWhiteSpace(settings.Smtp.UserName))
            await smtp.AuthenticateAsync(settings.Smtp.UserName, settings.Smtp.Password, cancellationToken);

        await smtp.SendAsync(message, cancellationToken);
        await smtp.DisconnectAsync(quit: true, cancellationToken);
    }
}
