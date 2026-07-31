using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

public class AiOrderImport : FullAuditedAggregateRoot<Guid>
{
    public AiOrderImportStatus Status { get; private set; }
    public string ContractVersion { get; private set; } = default!;
    public int CurrentRevision { get; private set; }
    public Guid CreatedByAdminId { get; private set; }
    public string IdempotencyKey { get; private set; } = default!;
    public string RequestHash { get; private set; } = default!;
    public string? ActiveProcessingLeaseToken { get; private set; }
    public DateTime? ActiveProcessingLeaseExpiresAt { get; private set; }
    public DateTime? NextRetryAt { get; private set; }
    public DateTime? ConfirmedAt { get; private set; }
    public Guid? ConfirmedByAdminId { get; private set; }
    public DateTime? CancelledAt { get; private set; }
    public Guid? CancelledByAdminId { get; private set; }
    public Guid? FormalOrderId { get; private set; }
    public string? MaterializationOperationKey { get; private set; }
    public string RetentionClass { get; private set; } = default!;
    public DateTime? RetentionUntil { get; private set; }
    public bool IsRetentionHeld { get; private set; }

    protected AiOrderImport()
    {
    }

    public AiOrderImport(
        Guid id,
        Guid createdByAdminId,
        string contractVersion,
        string idempotencyKey,
        string requestHash,
        string retentionClass,
        DateTime? retentionUntil = null)
        : base(id)
    {
        CreatedByAdminId = EnsureGuid(createdByAdminId, nameof(createdByAdminId));
        ContractVersion = EnsureText(contractVersion, nameof(contractVersion), 32);
        IdempotencyKey = EnsureText(idempotencyKey, nameof(idempotencyKey), 128);
        RequestHash = EnsureSha256(requestHash, nameof(requestHash));
        RetentionClass = EnsureText(retentionClass, nameof(retentionClass), 64);
        RetentionUntil = retentionUntil;
        Status = AiOrderImportStatus.Uploaded;
    }

    public void ClaimProcessingLease(string leaseToken, DateTime leaseExpiresAt, DateTime now)
    {
        ThrowIfTerminal();

        if (Status == AiOrderImportStatus.Processing &&
            ActiveProcessingLeaseExpiresAt.HasValue &&
            ActiveProcessingLeaseExpiresAt.Value > now)
        {
            throw Error("ProcessingLeaseAlreadyOwned");
        }

        if (Status is not (
            AiOrderImportStatus.Uploaded or
            AiOrderImportStatus.Processing or
            AiOrderImportStatus.Failed))
        {
            throw Error("CannotStartProcessing");
        }

        if (leaseExpiresAt <= now)
        {
            throw Error("ProcessingLeaseMustExpireInFuture");
        }

        ActiveProcessingLeaseToken = EnsureText(leaseToken, nameof(leaseToken), 64);
        ActiveProcessingLeaseExpiresAt = leaseExpiresAt;
        NextRetryAt = null;
        Status = AiOrderImportStatus.Processing;
    }

    public void CompleteProcessing(string leaseToken, DateTime now)
    {
        EnsureActiveLeaseOwner(leaseToken, now);
        if (CurrentRevision < 1)
        {
            throw Error("ProcessingSuccessRequiresRevision");
        }

        Status = AiOrderImportStatus.NeedsReview;
        ClearLease();
    }

    public void FailProcessing(
        string leaseToken,
        bool retryable,
        DateTime? nextRetryAt,
        DateTime now)
    {
        EnsureActiveLeaseOwner(leaseToken, now);

        if (!retryable && nextRetryAt.HasValue)
        {
            throw Error("PermanentFailureCannotHaveRetry");
        }

        if (retryable && nextRetryAt.HasValue && nextRetryAt.Value <= now)
        {
            throw Error("RetryMustBeInFuture");
        }

        Status = AiOrderImportStatus.Failed;
        NextRetryAt = retryable ? nextRetryAt : null;
        ClearLease();
    }

    public void RecoverExpiredProcessingLease(DateTime now, DateTime? nextRetryAt)
    {
        if (Status != AiOrderImportStatus.Processing ||
            !ActiveProcessingLeaseExpiresAt.HasValue ||
            ActiveProcessingLeaseExpiresAt.Value > now)
        {
            throw Error("ProcessingLeaseNotExpired");
        }

        Status = AiOrderImportStatus.Failed;
        NextRetryAt = nextRetryAt;
        ClearLease();
    }

    public void RenewProcessingLease(
        string leaseToken,
        DateTime leaseExpiresAt,
        DateTime now)
    {
        if (Status != AiOrderImportStatus.Processing ||
            ActiveProcessingLeaseToken is null ||
            !string.Equals(ActiveProcessingLeaseToken, leaseToken, StringComparison.Ordinal) ||
            !ActiveProcessingLeaseExpiresAt.HasValue ||
            ActiveProcessingLeaseExpiresAt.Value > now ||
            leaseExpiresAt <= now)
        {
            throw Error("ProcessingLeaseCannotBeRenewed");
        }

        ActiveProcessingLeaseExpiresAt = leaseExpiresAt;
    }

    public void AdvanceRevision(int expectedCurrentRevision, int newRevision)
    {
        ThrowIfTerminal();

        if (CurrentRevision != expectedCurrentRevision)
        {
            throw Error("RevisionConflict")
                .WithData("ExpectedRevision", expectedCurrentRevision)
                .WithData("CurrentRevision", CurrentRevision);
        }

        if (newRevision != expectedCurrentRevision + 1)
        {
            throw Error("RevisionMustBeSequential");
        }

        CurrentRevision = newRevision;
    }

    public void MarkDraft()
    {
        ThrowIfTerminal();

        if (Status is not (AiOrderImportStatus.NeedsReview or AiOrderImportStatus.Draft))
        {
            throw Error("CannotSaveDraft");
        }

        if (CurrentRevision < 1)
        {
            throw Error("DraftRequiresRevision");
        }

        Status = AiOrderImportStatus.Draft;
    }

    public void Confirm(Guid actorAdminId, int expectedRevision, DateTime now)
    {
        ThrowIfTerminal();

        if (Status != AiOrderImportStatus.Draft)
        {
            throw Error("CannotConfirm");
        }

        if (CurrentRevision < 1 || CurrentRevision != expectedRevision)
        {
            throw Error("RevisionConflict")
                .WithData("ExpectedRevision", expectedRevision)
                .WithData("CurrentRevision", CurrentRevision);
        }

        ConfirmedByAdminId = EnsureGuid(actorAdminId, nameof(actorAdminId));
        ConfirmedAt = now;
        Status = AiOrderImportStatus.Confirmed;
        ClearLease();
    }

    public void Cancel(Guid actorAdminId, DateTime now)
    {
        ThrowIfTerminal();
        CancelledByAdminId = EnsureGuid(actorAdminId, nameof(actorAdminId));
        CancelledAt = now;
        Status = AiOrderImportStatus.Cancelled;
        ClearLease();
    }

    public void UpdateRetention(string retentionClass, DateTime? retentionUntil, bool isHeld)
    {
        RetentionClass = EnsureText(retentionClass, nameof(retentionClass), 64);
        RetentionUntil = retentionUntil;
        IsRetentionHeld = isHeld;
    }

    private void EnsureActiveLeaseOwner(string leaseToken, DateTime now)
    {
        if (Status != AiOrderImportStatus.Processing ||
            ActiveProcessingLeaseToken is null ||
            !string.Equals(ActiveProcessingLeaseToken, leaseToken, StringComparison.Ordinal) ||
            !ActiveProcessingLeaseExpiresAt.HasValue ||
            ActiveProcessingLeaseExpiresAt.Value <= now)
        {
            throw Error("ProcessingLeaseNotOwned");
        }
    }

    private void ThrowIfTerminal()
    {
        if (Status is AiOrderImportStatus.Confirmed or AiOrderImportStatus.Cancelled)
        {
            throw Error("TerminalImportCannotChange")
                .WithData("Status", Status);
        }
    }

    private void ClearLease()
    {
        ActiveProcessingLeaseToken = null;
        ActiveProcessingLeaseExpiresAt = null;
    }

    private static Guid EnsureGuid(Guid value, string name)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("A non-empty identifier is required.", name);
        }

        return value;
    }

    internal static string EnsureText(string value, string name, int maximumLength)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > maximumLength)
        {
            throw new ArgumentException(
                $"A non-empty value of at most {maximumLength} characters is required.",
                name);
        }

        return normalized;
    }

    internal static string EnsureSha256(string value, string name)
    {
        var normalized = EnsureText(value, name, 64).ToLowerInvariant();
        if (normalized.Length != 64 || !normalized.All(Uri.IsHexDigit))
        {
            throw new ArgumentException("A 64-character SHA-256 hexadecimal digest is required.", name);
        }

        return normalized;
    }

    private static BusinessException Error(string code) =>
        new($"TeeNova:AiOrderImport:{code}");
}
