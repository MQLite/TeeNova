using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

public class AiOrderSourceAccessAudit : CreationAuditedEntity<Guid>
{
    public Guid ImportId { get; private set; }
    public Guid SourceDocumentId { get; private set; }
    public Guid AdminActorId { get; private set; }
    public AiOrderSourceAccessType AccessType { get; private set; }
    public bool Succeeded { get; private set; }
    public string? FailureCategory { get; private set; }
    public DateTime AccessedAt { get; private set; }

    protected AiOrderSourceAccessAudit()
    {
    }

    public AiOrderSourceAccessAudit(
        Guid id,
        Guid importId,
        Guid sourceDocumentId,
        Guid adminActorId,
        AiOrderSourceAccessType accessType,
        bool succeeded,
        string? failureCategory,
        DateTime accessedAt)
        : base(id)
    {
        if (importId == Guid.Empty ||
            sourceDocumentId == Guid.Empty ||
            adminActorId == Guid.Empty)
        {
            throw new ArgumentException("Non-empty import, source, and actor identifiers are required.");
        }

        ImportId = importId;
        SourceDocumentId = sourceDocumentId;
        AdminActorId = adminActorId;
        AccessType = accessType;
        Succeeded = succeeded;
        FailureCategory = string.IsNullOrWhiteSpace(failureCategory)
            ? null
            : AiOrderImport.EnsureText(failureCategory, nameof(failureCategory), 64);
        AccessedAt = accessedAt;
    }
}
