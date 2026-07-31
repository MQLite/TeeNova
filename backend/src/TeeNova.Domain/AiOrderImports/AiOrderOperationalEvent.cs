using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

/// <summary>
/// Privacy-safe, append-only operational evidence. It deliberately contains no
/// customer data, filename, object key, physical path, prompt, or provider body.
/// </summary>
public sealed class AiOrderOperationalEvent : CreationAuditedEntity<Guid>
{
    public Guid? ImportId { get; private set; }
    public Guid? SourceDocumentId { get; private set; }
    public Guid? ProcessingAttemptId { get; private set; }
    public AiOrderOperationalEventType EventType { get; private set; }
    public Guid? ActorAdminId { get; private set; }
    public string ActorType { get; private set; } = default!;
    public string? Reason { get; private set; }
    public string Outcome { get; private set; } = default!;
    public string? SafeErrorCode { get; private set; }
    public DateTime OccurredAt { get; private set; }
    public DateTime? ExpiresAt { get; private set; }

    private AiOrderOperationalEvent()
    {
    }

    public AiOrderOperationalEvent(
        Guid id,
        AiOrderOperationalEventType eventType,
        string actorType,
        string outcome,
        DateTime occurredAt,
        Guid? importId = null,
        Guid? sourceDocumentId = null,
        Guid? processingAttemptId = null,
        Guid? actorAdminId = null,
        string? reason = null,
        string? safeErrorCode = null,
        DateTime? expiresAt = null)
        : base(id)
    {
        if (actorAdminId == Guid.Empty || importId == Guid.Empty ||
            sourceDocumentId == Guid.Empty || processingAttemptId == Guid.Empty)
            throw new ArgumentException("Optional identifiers must be non-empty.");

        ImportId = importId;
        SourceDocumentId = sourceDocumentId;
        ProcessingAttemptId = processingAttemptId;
        EventType = eventType;
        ActorAdminId = actorAdminId;
        ActorType = AiOrderImport.EnsureText(actorType, nameof(actorType), 32);
        Reason = string.IsNullOrWhiteSpace(reason)
            ? null
            : AiOrderImport.EnsureText(reason, nameof(reason), 500);
        Outcome = AiOrderImport.EnsureText(outcome, nameof(outcome), 32);
        SafeErrorCode = string.IsNullOrWhiteSpace(safeErrorCode)
            ? null
            : AiOrderImport.EnsureText(safeErrorCode, nameof(safeErrorCode), 128);
        OccurredAt = occurredAt;
        ExpiresAt = expiresAt;
    }
}
