using System;
using System.Linq;
using Microsoft.Extensions.Options;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Email;

/// <summary>
/// Default <see cref="IStagingEmailGuard"/> (Jira 9908.2). Stateless; reads <see cref="EmailStagingOptions"/>.
/// See the interface for the transformation contract. All decoration is idempotent (guarded by a hidden
/// HTML sentinel and a plain-text sentinel) so double application cannot double-prefix or double-banner.
/// </summary>
public sealed class StagingEmailGuard : IStagingEmailGuard, ISingletonDependency
{
    // Hidden marker used to make HTML decoration idempotent.
    private const string HtmlSentinel = "<!--TEENOVA-STAGING-MARK-->";
    private const string TextSentinel = "*** STAGING TEST EMAIL ***";

    private readonly EmailStagingOptions _options;

    public StagingEmailGuard(IOptions<EmailStagingOptions> options)
    {
        _options = options.Value;
    }

    public bool IsStagingMode => _options.Mode;

    public StagingEmailDecision Apply(
        string  recipient,
        string  subject,
        string  htmlBody,
        string  textBody,
        string  fallbackSenderName,
        string  fallbackSenderAddress,
        string? fallbackReplyTo)
    {
        // Production mode: faithful passthrough, never blocked, behaviour unchanged.
        if (!_options.Mode)
        {
            return new StagingEmailDecision(
                Blocked: false,
                BlockReason: null,
                Email: new GuardedEmail(recipient, subject, htmlBody, textBody,
                    fallbackSenderName, fallbackSenderAddress, fallbackReplyTo));
        }

        // Fail-closed recipient resolution: never fall back to the original customer recipient.
        var effectiveRecipient = ResolveStagingRecipient(recipient);
        if (effectiveRecipient is null)
        {
            return new StagingEmailDecision(
                Blocked: true,
                BlockReason: "Staging email is enabled but no RecipientOverride or allowlisted recipient is configured.",
                Email: null);
        }

        var senderName    = string.IsNullOrWhiteSpace(_options.SenderName)    ? fallbackSenderName    : _options.SenderName!;
        var senderAddress = string.IsNullOrWhiteSpace(_options.SenderAddress) ? fallbackSenderAddress : _options.SenderAddress!;
        var replyTo       = string.IsNullOrWhiteSpace(_options.ReplyTo)       ? fallbackReplyTo        : _options.ReplyTo;

        return new StagingEmailDecision(
            Blocked: false,
            BlockReason: null,
            Email: new GuardedEmail(
                Recipient:     effectiveRecipient,
                Subject:       DecorateSubject(subject),
                HtmlBody:      DecorateHtml(htmlBody),
                TextBody:      DecorateText(textBody),
                SenderName:    senderName,
                SenderAddress: senderAddress,
                ReplyTo:       replyTo));
    }

    public string ForLog(string? recipient)
    {
        var value = recipient ?? string.Empty;
        if (!_options.Mode)
            return value; // production: unchanged log behaviour

        if (string.IsNullOrWhiteSpace(value))
            return "(none)";

        var at = value.IndexOf('@');
        if (at <= 0)
            return "***";

        var local  = value[..at];
        var domain = value[(at + 1)..];
        var head   = local.Length >= 1 ? local[0].ToString() : "";
        return $"{head}***@{domain}";
    }

    // ── recipient / decoration helpers ───────────────────────────────────────────────────────────────

    private string? ResolveStagingRecipient(string original)
    {
        // Primary control: rewrite everything to the approved internal mailbox.
        if (!string.IsNullOrWhiteSpace(_options.RecipientOverride))
            return _options.RecipientOverride.Trim();

        // Otherwise a recipient is only permitted if it is already an approved internal address.
        if (IsAllowlisted(original))
            return original.Trim();

        return null; // fail closed
    }

    private bool IsAllowlisted(string? recipient)
    {
        if (string.IsNullOrWhiteSpace(recipient))
            return false;

        var value = recipient.Trim();

        if (_options.AllowedRecipients.Any(r =>
                !string.IsNullOrWhiteSpace(r) && string.Equals(r.Trim(), value, StringComparison.OrdinalIgnoreCase)))
            return true;

        var at = value.IndexOf('@');
        if (at > 0 && at < value.Length - 1)
        {
            var domain = value[(at + 1)..];
            if (_options.AllowedDomains.Any(d =>
                    !string.IsNullOrWhiteSpace(d) && string.Equals(d.Trim().TrimStart('@'), domain, StringComparison.OrdinalIgnoreCase)))
                return true;
        }

        return false;
    }

    private string DecorateSubject(string subject)
    {
        var prefix = _options.SubjectPrefix ?? string.Empty;
        if (string.IsNullOrEmpty(prefix))
            return subject;

        // Idempotent: never produce "[STAGING TEST] [STAGING TEST] ...".
        return subject.StartsWith(prefix, StringComparison.Ordinal)
            ? subject
            : $"{prefix} {subject}";
    }

    private string DecorateHtml(string html)
    {
        // Idempotent: skip if already decorated.
        if (html.Contains(HtmlSentinel, StringComparison.Ordinal))
            return html;

        var banner = _options.BannerEnabled ? HtmlBanner() : string.Empty;
        var footer = _options.FooterEnabled ? HtmlFooter() : string.Empty;
        return $"{HtmlSentinel}{banner}{html}{footer}";
    }

    private string DecorateText(string text)
    {
        if (text.Contains(TextSentinel, StringComparison.Ordinal))
            return text;

        var banner = _options.BannerEnabled ? TextBanner() : string.Empty;
        var footer = _options.FooterEnabled ? TextFooter() : string.Empty;
        return $"{banner}{text}{footer}";
    }

    private static string HtmlBanner() =>
        HtmlSentinel +
        "<div style=\"background:#b91c1c;color:#ffffff;padding:12px 16px;border-radius:6px;margin:0 0 16px 0;" +
        "font-family:Arial,sans-serif;font-size:14px;line-height:1.4\">" +
        "<strong style=\"letter-spacing:0.5px\">STAGING TEST EMAIL</strong><br/>" +
        "This email was generated by the TeeNova staging environment for testing purposes. " +
        "It is not a production notification and no customer action is required." +
        "</div>";

    private string HtmlFooter()
    {
        var sha = string.IsNullOrWhiteSpace(_options.BuildSha) ? string.Empty : $"<br/>Build: {WebEncode(_options.BuildSha!)}";
        return "<div style=\"margin-top:20px;padding-top:12px;border-top:1px solid #dddddd;color:#666666;" +
               "font-family:Arial,sans-serif;font-size:12px;line-height:1.5\">" +
               "Environment: STAGING<br/>" +
               "Test hostname: staging.otahuhuprint.com<br/>" +
               "This message was redirected to an approved test recipient." + sha +
               "</div>";
    }

    private static string TextBanner() =>
        "*** STAGING TEST EMAIL ***\r\n" +
        "This email was generated by the TeeNova staging environment for testing purposes. " +
        "It is not a production notification and no customer action is required.\r\n\r\n";

    private string TextFooter()
    {
        var sha = string.IsNullOrWhiteSpace(_options.BuildSha) ? string.Empty : $"\r\nBuild: {_options.BuildSha}";
        return "\r\n\r\n---\r\nEnvironment: STAGING\r\n" +
               "Test hostname: staging.otahuhuprint.com\r\n" +
               "This message was redirected to an approved test recipient." + sha + "\r\n";
    }

    // Minimal HTML attribute/text encoder for the build-SHA value only (SHA is [0-9a-f], but stay safe).
    private static string WebEncode(string s) => System.Net.WebUtility.HtmlEncode(s);
}
