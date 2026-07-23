namespace TeeNova.Email;

/// <summary>
/// The transformed, ready-to-send form of an outbound email after the staging guard has run.
/// In production mode this is a faithful passthrough of the original values.
/// </summary>
public sealed record GuardedEmail(
    string  Recipient,
    string  Subject,
    string  HtmlBody,
    string  TextBody,
    string  SenderName,
    string  SenderAddress,
    string? ReplyTo);

/// <summary>
/// Outcome of applying the staging guard. When <see cref="Blocked"/> is true the message MUST NOT be
/// sent (fail-closed) and <see cref="Email"/> is null; <see cref="BlockReason"/> carries a safe,
/// recipient-free reason for logging.
/// </summary>
public sealed record StagingEmailDecision(bool Blocked, string? BlockReason, GuardedEmail? Email);

/// <summary>
/// Single shared decision point that decorates and re-targets outbound email when the environment runs
/// in staging mode (Jira 9908.2). Pure and host-independent so it is directly unit-testable. It never
/// sends — the <see cref="IEmailDispatcher"/> owns the SMTP transport and calls this first.
///
/// Staging transformation (only when <see cref="EmailStagingOptions.Mode"/> is true):
/// subject prefixed once with the staging marker; a visible HTML banner + plain-text warning + footer;
/// every recipient rewritten to the approved internal test mailbox (or an allowlisted recipient);
/// CC/BCC never carried; a staging Reply-To/sender applied. All transformations are idempotent.
/// </summary>
public interface IStagingEmailGuard
{
    /// <summary>True when staging email mode is active (guard transforms messages).</summary>
    bool IsStagingMode { get; }

    /// <summary>
    /// Applies the staging transformation. In production mode returns a passthrough decision (never
    /// blocked). In staging mode returns a blocked decision when no approved recipient can be resolved.
    /// The <paramref name="fallback*"/> values are the production/effective sender identity used when no
    /// staging-specific override is configured.
    /// </summary>
    StagingEmailDecision Apply(
        string  recipient,
        string  subject,
        string  htmlBody,
        string  textBody,
        string  fallbackSenderName,
        string  fallbackSenderAddress,
        string? fallbackReplyTo);

    /// <summary>
    /// Recipient rendering for logs: masks to <c>c***@example.com</c> in staging mode (so cloned
    /// customer addresses never reach general logs); returns the original value in production mode.
    /// </summary>
    string ForLog(string? recipient);
}
