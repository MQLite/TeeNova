using System;
using System.Security.Cryptography;
using System.Text;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

public class AiOrderImportRevision : CreationAuditedEntity<Guid>
{
    public Guid ImportId { get; private set; }
    public int Revision { get; private set; }
    public string ContractVersion { get; private set; } = default!;
    public string ValidationVersion { get; private set; } = default!;
    public string CanonicalJson { get; private set; } = default!;
    public string CanonicalSha256 { get; private set; } = default!;
    public AiOrderRevisionSource Source { get; private set; }
    public Guid ActorAdminId { get; private set; }
    public DateTime RecordedAt { get; private set; }
    public Guid? ProcessingAttemptId { get; private set; }
    public string? Provider { get; private set; }
    public string? Model { get; private set; }
    public string? PromptVersion { get; private set; }
    public string? StructuredOutputMode { get; private set; }
    public string? PricingVersion { get; private set; }

    protected AiOrderImportRevision()
    {
    }

    public AiOrderImportRevision(
        Guid id,
        Guid importId,
        int revision,
        string contractVersion,
        string validationVersion,
        string canonicalJson,
        string canonicalSha256,
        AiOrderRevisionSource source,
        Guid actorAdminId,
        DateTime recordedAt)
        : base(id)
    {
        if (importId == Guid.Empty || actorAdminId == Guid.Empty)
            throw new ArgumentException("Non-empty import and actor identifiers are required.");
        if (revision < 1)
            throw new ArgumentOutOfRangeException(nameof(revision));

        ImportId = importId;
        Revision = revision;
        ContractVersion = AiOrderImport.EnsureText(contractVersion, nameof(contractVersion), 32);
        ValidationVersion = AiOrderImport.EnsureText(validationVersion, nameof(validationVersion), 32);
        if (string.IsNullOrWhiteSpace(canonicalJson))
            throw new ArgumentException("Canonical JSON is required.", nameof(canonicalJson));

        CanonicalJson = canonicalJson;
        CanonicalSha256 = AiOrderImport.EnsureSha256(canonicalSha256, nameof(canonicalSha256));
        var computedHash = Convert
            .ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(CanonicalJson)))
            .ToLowerInvariant();
        if (!string.Equals(CanonicalSha256, computedHash, StringComparison.Ordinal))
        {
            throw new BusinessException("TeeNova:AiOrderImport:CanonicalHashMismatch");
        }
        Source = source;
        ActorAdminId = actorAdminId;
        RecordedAt = recordedAt;
    }

    public void AttributeRecognition(
        Guid processingAttemptId,
        string provider,
        string model,
        string promptVersion,
        string structuredOutputMode,
        string pricingVersion)
    {
        if (Source != AiOrderRevisionSource.AI ||
            processingAttemptId == Guid.Empty ||
            ProcessingAttemptId.HasValue)
        {
            throw new BusinessException("TeeNova:AiOrderImport:InvalidRecognitionAttribution");
        }

        ProcessingAttemptId = processingAttemptId;
        Provider = AiOrderImport.EnsureText(provider, nameof(provider), 64);
        Model = AiOrderImport.EnsureText(model, nameof(model), 128);
        PromptVersion = AiOrderImport.EnsureText(promptVersion, nameof(promptVersion), 64);
        StructuredOutputMode = AiOrderImport.EnsureText(
            structuredOutputMode,
            nameof(structuredOutputMode),
            64);
        PricingVersion = AiOrderImport.EnsureText(pricingVersion, nameof(pricingVersion), 64);
    }
}
