using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Notifications;

/// <summary>
/// Immutable record of an email send attempt for an order event.
/// Used for idempotency (Sent records block resend) and audit.
/// </summary>
public class EmailNotificationLog : CreationAuditedEntity<Guid>
{
    public Guid OrderId { get; private set; }

    /// <summary>String constant from <see cref="EmailEventTypes"/>.</summary>
    public string EventType { get; private set; } = default!;

    public string Recipient { get; private set; } = default!;
    public string Subject { get; private set; } = default!;

    /// <summary>String constant from <see cref="EmailSendStatus"/>.</summary>
    public string Status { get; private set; } = default!;

    public string? ErrorMessage { get; private set; }
    public DateTime? SentAt { get; private set; }

    protected EmailNotificationLog() { }

    public static EmailNotificationLog Sent(
        Guid id,
        Guid orderId,
        string eventType,
        string recipient,
        string subject)
        => new()
        {
            Id           = id,
            OrderId      = orderId,
            EventType    = eventType,
            Recipient    = recipient,
            Subject      = subject,
            Status       = EmailSendStatus.Sent,
            SentAt       = DateTime.UtcNow,
            ErrorMessage = null,
        };

    public static EmailNotificationLog Failed(
        Guid id,
        Guid orderId,
        string eventType,
        string recipient,
        string subject,
        string errorMessage)
        => new()
        {
            Id           = id,
            OrderId      = orderId,
            EventType    = eventType,
            Recipient    = recipient,
            Subject      = subject,
            Status       = EmailSendStatus.Failed,
            SentAt       = null,
            ErrorMessage = errorMessage.Length > 2000
                ? errorMessage[..2000]
                : errorMessage,
        };
}
