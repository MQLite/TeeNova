using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

public class AiOrderProcessingAttempt : CreationAuditedEntity<Guid>
{
    public Guid ImportId { get; private set; }
    public int AttemptNumber { get; private set; }
    public string LeaseToken { get; private set; } = default!;
    public string? Provider { get; private set; }
    public string? Model { get; private set; }
    public string? ProviderRequestId { get; private set; }
    public AiOrderProcessingAttemptOutcome Outcome { get; private set; }
    public DateTime SubmittedAt { get; private set; }
    public DateTime? CompletedAt { get; private set; }
    public string? SafeErrorCode { get; private set; }
    public bool? IsRetryable { get; private set; }
    public DateTime? NextRetryAt { get; private set; }
    public string? RawResultObjectKey { get; private set; }
    public string? RawResultSha256 { get; private set; }
    public long? InputTokenCount { get; private set; }
    public long? OutputTokenCount { get; private set; }
    public long? CachedInputTokenCount { get; private set; }
    public string? ApiMode { get; private set; }
    public string? ApiVersion { get; private set; }
    public string? PromptVersion { get; private set; }
    public string? ContractVersion { get; private set; }
    public string? StructuredOutputMode { get; private set; }
    public string? PricingVersion { get; private set; }
    public string? PricingSnapshotJson { get; private set; }
    public string? SourceSnapshotJson { get; private set; }
    public string? StartOperationKey { get; private set; }
    public string? StartRequestHash { get; private set; }
    public string? FinishReason { get; private set; }
    public decimal? EstimatedCostUsd { get; private set; }
    public decimal? ActualCostUsd { get; private set; }
    public long? DurationMilliseconds { get; private set; }
    public DateTime? RawResultRetentionUntil { get; private set; }
    public DateTime? RawResultDeletedAt { get; private set; }
    public int RawResultDeletionFailureCount { get; private set; }
    public DateTime? RawResultDeletionNextRetryAt { get; private set; }
    public string? RawResultDeletionSafeErrorCode { get; private set; }
    public string? WorkerClaimToken { get; private set; }
    public DateTime? WorkerClaimExpiresAt { get; private set; }
    public bool RepairAttempted { get; private set; }

    protected AiOrderProcessingAttempt()
    {
    }

    public AiOrderProcessingAttempt(
        Guid id,
        Guid importId,
        int attemptNumber,
        string leaseToken,
        string? provider,
        string? model,
        DateTime submittedAt)
        : base(id)
    {
        if (importId == Guid.Empty)
            throw new ArgumentException("A non-empty import identifier is required.", nameof(importId));
        if (attemptNumber < 1)
            throw new ArgumentOutOfRangeException(nameof(attemptNumber));

        ImportId = importId;
        AttemptNumber = attemptNumber;
        LeaseToken = AiOrderImport.EnsureText(leaseToken, nameof(leaseToken), 64);
        Provider = Optional(provider, 64, nameof(provider));
        Model = Optional(model, 128, nameof(model));
        SubmittedAt = submittedAt;
        Outcome = AiOrderProcessingAttemptOutcome.Processing;
    }

    public void ConfigureRecognition(
        string apiMode,
        string apiVersion,
        string promptVersion,
        string contractVersion,
        string structuredOutputMode,
        string pricingVersion,
        string pricingSnapshotJson,
        string sourceSnapshotJson,
        string startOperationKey,
        string startRequestHash,
        decimal estimatedCostUsd)
    {
        EnsureActive();
        if (EstimatedCostUsd.HasValue)
            throw new BusinessException("TeeNova:AiOrderImport:AttemptSnapshotAlreadyConfigured");
        if (estimatedCostUsd < 0)
            throw new ArgumentOutOfRangeException(nameof(estimatedCostUsd));

        ApiMode = AiOrderImport.EnsureText(apiMode, nameof(apiMode), 64);
        ApiVersion = AiOrderImport.EnsureText(apiVersion, nameof(apiVersion), 32);
        PromptVersion = AiOrderImport.EnsureText(promptVersion, nameof(promptVersion), 64);
        ContractVersion = AiOrderImport.EnsureText(contractVersion, nameof(contractVersion), 32);
        StructuredOutputMode = AiOrderImport.EnsureText(
            structuredOutputMode,
            nameof(structuredOutputMode),
            64);
        PricingVersion = AiOrderImport.EnsureText(pricingVersion, nameof(pricingVersion), 64);
        PricingSnapshotJson = RequiredJson(pricingSnapshotJson, 4000, nameof(pricingSnapshotJson));
        SourceSnapshotJson = RequiredJson(sourceSnapshotJson, 16000, nameof(sourceSnapshotJson));
        StartOperationKey = AiOrderImport.EnsureText(
            startOperationKey,
            nameof(startOperationKey),
            128);
        StartRequestHash = AiOrderImport.EnsureSha256(startRequestHash, nameof(startRequestHash));
        EstimatedCostUsd = estimatedCostUsd;
    }

    public void ClaimWorker(string claimToken, DateTime expiresAt, DateTime now)
    {
        EnsureActive();
        if (WorkerClaimExpiresAt.HasValue && WorkerClaimExpiresAt.Value > now)
            throw new BusinessException("TeeNova:AiOrderImport:AttemptWorkerAlreadyClaimed");
        if (expiresAt <= now)
            throw new ArgumentOutOfRangeException(nameof(expiresAt));

        WorkerClaimToken = AiOrderImport.EnsureText(claimToken, nameof(claimToken), 64);
        WorkerClaimExpiresAt = expiresAt;
    }

    public void ReleaseWorkerClaim(string claimToken)
    {
        if (!string.Equals(WorkerClaimToken, claimToken, StringComparison.Ordinal))
            throw new BusinessException("TeeNova:AiOrderImport:AttemptWorkerClaimNotOwned");
        WorkerClaimToken = null;
        WorkerClaimExpiresAt = null;
    }

    public void MarkRepairAttempted()
    {
        EnsureActive();
        if (RepairAttempted)
            throw new BusinessException("TeeNova:AiOrderImport:RepairAlreadyAttempted");
        RepairAttempted = true;
    }

    public void MarkRawResultDeleted(DateTime deletedAt)
    {
        if (Outcome != AiOrderProcessingAttemptOutcome.Succeeded ||
            RawResultObjectKey is null ||
            RawResultDeletedAt.HasValue ||
            !RawResultRetentionUntil.HasValue ||
            RawResultRetentionUntil.Value > deletedAt)
            throw new BusinessException("TeeNova:AiOrderImport:RawResultCannotBeDeleted");
        RawResultDeletedAt = deletedAt;
        RawResultDeletionNextRetryAt = null;
        RawResultDeletionSafeErrorCode = null;
    }

    public void MarkRawResultDeletionFailed(string safeErrorCode, DateTime nextRetryAt)
    {
        if (RawResultDeletedAt.HasValue || RawResultObjectKey is null)
            throw new BusinessException("TeeNova:AiOrderImport:RawResultCannotBeDeleted");
        RawResultDeletionFailureCount++;
        RawResultDeletionNextRetryAt = nextRetryAt;
        RawResultDeletionSafeErrorCode = AiOrderImport.EnsureText(
            safeErrorCode,
            nameof(safeErrorCode),
            128);
    }

    public void SetRawResultRetentionUntil(DateTime? retentionUntil)
    {
        RawResultRetentionUntil = retentionUntil;
    }

    public void Complete(
        DateTime completedAt,
        string? providerRequestId,
        string? rawResultObjectKey,
        string? rawResultSha256,
        long? inputTokenCount = null,
        long? outputTokenCount = null,
        long? cachedInputTokenCount = null,
        string? finishReason = null,
        decimal? actualCostUsd = null,
        long? durationMilliseconds = null,
        DateTime? rawResultRetentionUntil = null,
        string? workerClaimToken = null)
    {
        EnsureActive();
        EnsureWorkerClaim(workerClaimToken);
        ValidateTokenCount(inputTokenCount, nameof(inputTokenCount));
        ValidateTokenCount(outputTokenCount, nameof(outputTokenCount));
        ValidateTokenCount(cachedInputTokenCount, nameof(cachedInputTokenCount));
        if (actualCostUsd < 0)
            throw new ArgumentOutOfRangeException(nameof(actualCostUsd));
        if (durationMilliseconds < 0)
            throw new ArgumentOutOfRangeException(nameof(durationMilliseconds));

        ProviderRequestId = Optional(providerRequestId, 256, nameof(providerRequestId));
        RawResultObjectKey = Optional(rawResultObjectKey, 160, nameof(rawResultObjectKey));
        RawResultSha256 = rawResultSha256 is null
            ? null
            : AiOrderImport.EnsureSha256(rawResultSha256, nameof(rawResultSha256));
        InputTokenCount = inputTokenCount;
        OutputTokenCount = outputTokenCount;
        CachedInputTokenCount = cachedInputTokenCount;
        FinishReason = Optional(finishReason, 128, nameof(finishReason));
        ActualCostUsd = actualCostUsd;
        DurationMilliseconds = durationMilliseconds;
        RawResultRetentionUntil = rawResultRetentionUntil;
        CompletedAt = completedAt;
        Outcome = AiOrderProcessingAttemptOutcome.Succeeded;
        WorkerClaimToken = null;
        WorkerClaimExpiresAt = null;
    }

    public void Fail(
        DateTime completedAt,
        string safeErrorCode,
        bool retryable,
        DateTime? nextRetryAt,
        string? providerRequestId = null,
        string? workerClaimToken = null)
    {
        EnsureActive();
        EnsureWorkerClaim(workerClaimToken);
        SafeErrorCode = AiOrderImport.EnsureText(safeErrorCode, nameof(safeErrorCode), 128);
        ProviderRequestId = Optional(providerRequestId, 256, nameof(providerRequestId));
        IsRetryable = retryable;
        NextRetryAt = retryable ? nextRetryAt : null;
        CompletedAt = completedAt;
        Outcome = retryable
            ? AiOrderProcessingAttemptOutcome.RetryableFailure
            : AiOrderProcessingAttemptOutcome.PermanentFailure;
        WorkerClaimToken = null;
        WorkerClaimExpiresAt = null;
    }

    public void MarkCancelled(DateTime completedAt)
    {
        EnsureActive();
        CompletedAt = completedAt;
        Outcome = AiOrderProcessingAttemptOutcome.Cancelled;
        WorkerClaimToken = null;
        WorkerClaimExpiresAt = null;
    }

    private void EnsureActive()
    {
        if (Outcome != AiOrderProcessingAttemptOutcome.Processing)
            throw new BusinessException("TeeNova:AiOrderImport:AttemptAlreadyCompleted");
    }

    private void EnsureWorkerClaim(string? workerClaimToken)
    {
        if (workerClaimToken is not null &&
            !string.Equals(WorkerClaimToken, workerClaimToken, StringComparison.Ordinal))
            throw new BusinessException("TeeNova:AiOrderImport:AttemptWorkerClaimNotOwned");
    }

    private static string? Optional(string? value, int maxLength, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : AiOrderImport.EnsureText(value, name, maxLength);

    private static void ValidateTokenCount(long? value, string name)
    {
        if (value < 0)
            throw new ArgumentOutOfRangeException(name);
    }

    private static string RequiredJson(string value, int maxLength, string name)
    {
        var normalized = AiOrderImport.EnsureText(value, name, maxLength);
        if (normalized[0] is not ('{' or '['))
            throw new ArgumentException("A JSON object or array is required.", name);
        return normalized;
    }
}
