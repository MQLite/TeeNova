using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

public class AiOrderReviewEvent : CreationAuditedEntity<Guid>
{
    public Guid ImportId { get; private set; }
    public int? FromRevision { get; private set; }
    public int ToRevision { get; private set; }
    public AiOrderReviewAction Action { get; private set; }
    public string? JsonPointer { get; private set; }
    public string? BeforeJson { get; private set; }
    public string? AfterJson { get; private set; }
    public string? Reason { get; private set; }
    public Guid ActorAdminId { get; private set; }
    public DateTime RecordedAt { get; private set; }

    protected AiOrderReviewEvent()
    {
    }

    public AiOrderReviewEvent(
        Guid id,
        Guid importId,
        int? fromRevision,
        int toRevision,
        AiOrderReviewAction action,
        string? jsonPointer,
        string? beforeJson,
        string? afterJson,
        string? reason,
        Guid actorAdminId,
        DateTime recordedAt)
        : base(id)
    {
        if (importId == Guid.Empty || actorAdminId == Guid.Empty)
            throw new ArgumentException("Non-empty import and actor identifiers are required.");
        if (fromRevision is < 1 || toRevision < 1 || fromRevision > toRevision)
            throw new ArgumentOutOfRangeException(nameof(toRevision));

        ImportId = importId;
        FromRevision = fromRevision;
        ToRevision = toRevision;
        Action = action;
        JsonPointer = Optional(jsonPointer, 1024, nameof(jsonPointer));
        BeforeJson = NullIfWhiteSpace(beforeJson);
        AfterJson = NullIfWhiteSpace(afterJson);
        Reason = Optional(reason, 1000, nameof(reason));
        ActorAdminId = actorAdminId;
        RecordedAt = recordedAt;
    }

    private static string? Optional(string? value, int maximumLength, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : AiOrderImport.EnsureText(value, name, maximumLength);

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
