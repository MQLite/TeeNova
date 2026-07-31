using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;
using Volo.Abp.Uow;

namespace TeeNova.AiOrderImports;

/// <summary>
/// Internal persistence orchestration for the import foundation. This intentionally is not an
/// IApplicationService/AppService and therefore does not create a conventional HTTP API.
/// </summary>
public class AiOrderImportFoundationService : ITransientDependency
{
    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderSourceDocument, Guid> _sources;
    private readonly IRepository<AiOrderProcessingAttempt, Guid> _attempts;
    private readonly IRepository<AiOrderImportRevision, Guid> _revisions;
    private readonly IRepository<AiOrderReviewEvent, Guid> _reviewEvents;
    private readonly IRepository<AiOrderSourceAccessAudit, Guid> _sourceAccessAudits;
    private readonly IGuidGenerator _guidGenerator;
    private readonly TimeProvider _timeProvider;

    public AiOrderImportFoundationService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderSourceDocument, Guid> sources,
        IRepository<AiOrderProcessingAttempt, Guid> attempts,
        IRepository<AiOrderImportRevision, Guid> revisions,
        IRepository<AiOrderReviewEvent, Guid> reviewEvents,
        IRepository<AiOrderSourceAccessAudit, Guid> sourceAccessAudits,
        IGuidGenerator guidGenerator,
        TimeProvider timeProvider)
    {
        _imports = imports;
        _sources = sources;
        _attempts = attempts;
        _revisions = revisions;
        _reviewEvents = reviewEvents;
        _sourceAccessAudits = sourceAccessAudits;
        _guidGenerator = guidGenerator;
        _timeProvider = timeProvider;
    }

    [UnitOfWork]
    public virtual async Task<AiOrderImport> CreateIdempotentlyAsync(
        Guid createdByAdminId,
        string idempotencyKey,
        string requestHash,
        string contractVersion,
        string retentionClass,
        DateTime? retentionUntil = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeIdempotencyKey(idempotencyKey);
        var normalizedHash = NormalizeSha256(requestHash);

        var query = await _imports.GetQueryableAsync();
        var existing = await query.SingleOrDefaultAsync(
            x => x.CreatedByAdminId == createdByAdminId &&
                 x.IdempotencyKey == normalizedKey,
            cancellationToken);

        if (existing is not null)
        {
            return AiOrderImportIdempotencyPolicy.ReturnExistingOrThrow(
                existing,
                normalizedHash);
        }

        var import = new AiOrderImport(
            _guidGenerator.Create(),
            createdByAdminId,
            contractVersion,
            normalizedKey,
            normalizedHash,
            retentionClass,
            retentionUntil);

        return await _imports.InsertAsync(import, autoSave: true, cancellationToken);
    }

    public virtual Task<AiOrderImport> GetInternalAsync(
        Guid importId,
        CancellationToken cancellationToken = default) =>
        _imports.GetAsync(importId, includeDetails: false, cancellationToken);

    [UnitOfWork]
    public virtual async Task<AiOrderSourceDocument> AttachSourceMetadataAsync(
        Guid importId,
        int sequence,
        AiOrderCaptureMethod captureMethod,
        string privateObjectKey,
        string contentType,
        long byteSize,
        int? pageCount,
        string sha256,
        string? originalFileName,
        Guid uploadedByAdminId,
        DateTime? retentionUntil = null,
        string? uploadIdempotencyKey = null,
        int? imageWidth = null,
        int? imageHeight = null,
        string? qualityWarningsJson = null,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        if (import.Status is AiOrderImportStatus.Confirmed or AiOrderImportStatus.Cancelled)
            throw new BusinessException("TeeNova:AiOrderImport:TerminalImportCannotChange");

        var source = new AiOrderSourceDocument(
            _guidGenerator.Create(),
            importId,
            sequence,
            captureMethod,
            privateObjectKey,
            contentType,
            byteSize,
            pageCount,
            sha256,
            originalFileName,
            uploadedByAdminId,
            UtcNow(),
            retentionUntil,
            uploadIdempotencyKey,
            imageWidth,
            imageHeight,
            qualityWarningsJson);

        return await _sources.InsertAsync(source, autoSave: true, cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task ReorderSourcesAsync(
        Guid importId,
        IReadOnlyList<Guid> orderedDocumentIds,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        EnsureSourceModificationAllowed(import);

        var query = await _sources.GetQueryableAsync();
        var active = await query
            .Where(x => x.ImportId == importId && x.ContentDeletedAt == null)
            .OrderBy(x => x.Sequence)
            .ToListAsync(cancellationToken);
        if (orderedDocumentIds.Count != active.Count ||
            orderedDocumentIds.Distinct().Count() != active.Count ||
            active.Any(x => !orderedDocumentIds.Contains(x.Id)))
        {
            throw new BusinessException(
                AiOrderImportErrorCodes.InvalidDocumentOrder,
                "Document order must contain every active source exactly once.");
        }

        await ApplySequenceOrderAsync(active, orderedDocumentIds, cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task MarkSourceDeletedAndReorderAsync(
        Guid importId,
        Guid documentId,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        EnsureSourceModificationAllowed(import);
        var query = await _sources.GetQueryableAsync();
        var source = await query.SingleOrDefaultAsync(
            x => x.Id == documentId &&
                 x.ImportId == importId &&
                 x.ContentDeletedAt == null,
            cancellationToken);
        if (source is null)
            throw new BusinessException(
                AiOrderImportErrorCodes.SourceNotFound,
                "The source document was not found.");

        source.MarkContentDeleted(UtcNow());
        await _sources.UpdateAsync(source, autoSave: true, cancellationToken);

        query = await _sources.GetQueryableAsync();
        var remaining = await query
            .Where(x => x.ImportId == importId && x.ContentDeletedAt == null)
            .OrderBy(x => x.Sequence)
            .ToListAsync(cancellationToken);
        await ApplySequenceOrderAsync(
            remaining,
            remaining.Select(x => x.Id).ToArray(),
            cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task SetSourceRotationAsync(
        Guid importId,
        Guid documentId,
        int rotationDegrees,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        EnsureSourceModificationAllowed(import);
        var query = await _sources.GetQueryableAsync();
        var source = await query.SingleOrDefaultAsync(
            x => x.Id == documentId &&
                 x.ImportId == importId &&
                 x.ContentDeletedAt == null,
            cancellationToken);
        if (source is null)
            throw new BusinessException(
                AiOrderImportErrorCodes.SourceNotFound,
                "The source document was not found.");

        source.SetRotation(rotationDegrees);
        await _sources.UpdateAsync(source, autoSave: true, cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task MarkSourceDeletionFailedAsync(
        Guid importId,
        Guid documentId,
        string safeErrorCode,
        CancellationToken cancellationToken = default)
    {
        var query = await _sources.GetQueryableAsync();
        var source = await query.SingleOrDefaultAsync(
            x => x.Id == documentId &&
                 x.ImportId == importId &&
                 x.ContentDeletedAt == null,
            cancellationToken);
        if (source is null)
            return;
        source.MarkDeletionFailed(safeErrorCode, UtcNow().AddMinutes(5));
        await _sources.UpdateAsync(source, autoSave: true, cancellationToken);
    }

    [UnitOfWork]
    public virtual Task<AiOrderSourceAccessAudit> RecordSourceAccessAsync(
        Guid importId,
        Guid documentId,
        Guid actorAdminId,
        AiOrderSourceAccessType accessType,
        bool succeeded,
        string? failureCategory,
        CancellationToken cancellationToken = default)
    {
        var audit = new AiOrderSourceAccessAudit(
            _guidGenerator.Create(),
            importId,
            documentId,
            actorAdminId,
            accessType,
            succeeded,
            failureCategory,
            UtcNow());
        return _sourceAccessAudits.InsertAsync(audit, autoSave: true, cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task<AiOrderImportRevision> AppendRevisionAsync(
        Guid importId,
        int expectedCurrentRevision,
        string validationVersion,
        string canonicalJson,
        string canonicalSha256,
        AiOrderRevisionSource source,
        Guid actorAdminId,
        bool markDraft = false,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        var nextRevision = expectedCurrentRevision + 1;
        import.AdvanceRevision(expectedCurrentRevision, nextRevision);

        if (markDraft)
            import.MarkDraft();

        var revision = new AiOrderImportRevision(
            _guidGenerator.Create(),
            importId,
            nextRevision,
            import.ContractVersion,
            validationVersion,
            canonicalJson,
            canonicalSha256,
            source,
            actorAdminId,
            UtcNow());

        await _revisions.InsertAsync(revision, autoSave: false, cancellationToken);
        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
        return revision;
    }

    [UnitOfWork]
    public virtual async Task<AiOrderImportRevision> AppendReviewedRevisionAsync(
        Guid importId,
        int expectedCurrentRevision,
        string validationVersion,
        string canonicalJson,
        string canonicalSha256,
        Guid actorAdminId,
        IReadOnlyCollection<AiOrderReviewEventInput> reviewEvents,
        bool markDraft = true,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(reviewEvents);
        if (reviewEvents.Count == 0)
            throw new ArgumentException(
                "At least one review event is required.",
                nameof(reviewEvents));

        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        var nextRevision = expectedCurrentRevision + 1;
        import.AdvanceRevision(expectedCurrentRevision, nextRevision);
        if (markDraft)
            import.MarkDraft();

        var now = UtcNow();
        var revision = new AiOrderImportRevision(
            _guidGenerator.Create(),
            importId,
            nextRevision,
            import.ContractVersion,
            validationVersion,
            canonicalJson,
            canonicalSha256,
            AiOrderRevisionSource.Staff,
            actorAdminId,
            now);

        await _revisions.InsertAsync(revision, autoSave: false, cancellationToken);

        foreach (var item in reviewEvents)
        {
            var reviewEvent = new AiOrderReviewEvent(
                _guidGenerator.Create(),
                importId,
                expectedCurrentRevision == 0 ? null : expectedCurrentRevision,
                nextRevision,
                item.Action,
                item.JsonPointer,
                item.BeforeJson,
                item.AfterJson,
                item.Reason,
                actorAdminId,
                now);
            await _reviewEvents.InsertAsync(reviewEvent, autoSave: false, cancellationToken);
        }

        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
        return revision;
    }

    [UnitOfWork]
    public virtual async Task<AiOrderReviewEvent> AppendReviewEventAsync(
        Guid importId,
        int? fromRevision,
        int toRevision,
        AiOrderReviewAction action,
        string? jsonPointer,
        string? beforeJson,
        string? afterJson,
        string? reason,
        Guid actorAdminId,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        if (toRevision > import.CurrentRevision)
            throw new BusinessException("TeeNova:AiOrderImport:ReviewRevisionNotFound");

        var reviewEvent = new AiOrderReviewEvent(
            _guidGenerator.Create(),
            importId,
            fromRevision,
            toRevision,
            action,
            jsonPointer,
            beforeJson,
            afterJson,
            reason,
            actorAdminId,
            UtcNow());

        return await _reviewEvents.InsertAsync(
            reviewEvent,
            autoSave: true,
            cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task<AiOrderProcessingAttempt> ClaimProcessingLeaseAsync(
        Guid importId,
        TimeSpan leaseDuration,
        string? provider = null,
        string? model = null,
        CancellationToken cancellationToken = default)
    {
        if (leaseDuration <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(leaseDuration));

        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        var now = UtcNow();
        var leaseToken = _guidGenerator.Create().ToString("N");
        import.ClaimProcessingLease(leaseToken, now.Add(leaseDuration), now);

        var attemptQuery = await _attempts.GetQueryableAsync();
        var attemptNumber = await attemptQuery
            .Where(x => x.ImportId == importId)
            .CountAsync(cancellationToken) + 1;

        var attempt = new AiOrderProcessingAttempt(
            _guidGenerator.Create(),
            importId,
            attemptNumber,
            leaseToken,
            provider,
            model,
            now);

        await _attempts.InsertAsync(attempt, autoSave: false, cancellationToken);
        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
        return attempt;
    }

    [UnitOfWork]
    public virtual async Task CompleteProcessingAttemptAsync(
        Guid importId,
        string leaseToken,
        int expectedCurrentRevision,
        string validationVersion,
        string canonicalJson,
        string canonicalSha256,
        Guid actorAdminId,
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
        string? workerClaimToken = null,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        var attempt = await FindAttemptByLeaseAsync(importId, leaseToken, cancellationToken);
        var now = UtcNow();

        var nextRevision = expectedCurrentRevision + 1;
        import.AdvanceRevision(expectedCurrentRevision, nextRevision);
        import.CompleteProcessing(leaseToken, now);
        attempt.Complete(
            now,
            providerRequestId,
            rawResultObjectKey,
            rawResultSha256,
            inputTokenCount,
            outputTokenCount,
            cachedInputTokenCount,
            finishReason,
            actualCostUsd,
            durationMilliseconds,
            rawResultRetentionUntil,
            workerClaimToken);

        var revision = new AiOrderImportRevision(
            _guidGenerator.Create(),
            importId,
            nextRevision,
            import.ContractVersion,
            validationVersion,
            canonicalJson,
            canonicalSha256,
            AiOrderRevisionSource.AI,
            actorAdminId,
            now);
        if (attempt.Provider is not null &&
            attempt.Model is not null &&
            attempt.PromptVersion is not null &&
            attempt.StructuredOutputMode is not null &&
            attempt.PricingVersion is not null)
        {
            revision.AttributeRecognition(
                attempt.Id,
                attempt.Provider,
                attempt.Model,
                attempt.PromptVersion,
                attempt.StructuredOutputMode,
                attempt.PricingVersion);
        }

        await _revisions.InsertAsync(revision, autoSave: false, cancellationToken);
        await _attempts.UpdateAsync(attempt, autoSave: false, cancellationToken);
        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task FailProcessingAttemptAsync(
        Guid importId,
        string leaseToken,
        string safeErrorCode,
        bool retryable,
        DateTime? nextRetryAt,
        string? providerRequestId = null,
        string? workerClaimToken = null,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        var attempt = await FindAttemptByLeaseAsync(importId, leaseToken, cancellationToken);
        var now = UtcNow();

        import.FailProcessing(leaseToken, retryable, nextRetryAt, now);
        attempt.Fail(
            now,
            safeErrorCode,
            retryable,
            nextRetryAt,
            providerRequestId,
            workerClaimToken);

        await _attempts.UpdateAsync(attempt, autoSave: false, cancellationToken);
        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
    }

    [UnitOfWork]
    public virtual async Task CancelAsync(
        Guid importId,
        Guid actorAdminId,
        CancellationToken cancellationToken = default)
    {
        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        var leaseToken = import.ActiveProcessingLeaseToken;
        var now = UtcNow();

        import.Cancel(actorAdminId, now);

        if (leaseToken is not null)
        {
            var attempt = await FindAttemptByLeaseAsync(importId, leaseToken, cancellationToken);
            attempt.MarkCancelled(now);
            await _attempts.UpdateAsync(attempt, autoSave: false, cancellationToken);
        }

        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
    }

    private async Task<AiOrderProcessingAttempt> FindAttemptByLeaseAsync(
        Guid importId,
        string leaseToken,
        CancellationToken cancellationToken)
    {
        var query = await _attempts.GetQueryableAsync();
        var attempt = await query.SingleOrDefaultAsync(
            x => x.ImportId == importId && x.LeaseToken == leaseToken,
            cancellationToken);

        return attempt ??
               throw new BusinessException("TeeNova:AiOrderImport:ProcessingAttemptNotFound");
    }

    private DateTime UtcNow() => _timeProvider.GetUtcNow().UtcDateTime;

    private async Task ApplySequenceOrderAsync(
        IReadOnlyCollection<AiOrderSourceDocument> active,
        IReadOnlyList<Guid> orderedDocumentIds,
        CancellationToken cancellationToken)
    {
        if (active.Count == 0)
            return;

        var byId = active.ToDictionary(x => x.Id);
        var temporaryBase = active.Max(x => x.Sequence) + active.Count + 100;
        for (var index = 0; index < orderedDocumentIds.Count; index++)
            byId[orderedDocumentIds[index]].ChangeSequence(temporaryBase + index);
        await _sources.UpdateManyAsync(active, autoSave: true, cancellationToken);

        for (var index = 0; index < orderedDocumentIds.Count; index++)
            byId[orderedDocumentIds[index]].ChangeSequence(index + 1);
        await _sources.UpdateManyAsync(active, autoSave: true, cancellationToken);
    }

    private static void EnsureSourceModificationAllowed(AiOrderImport import)
    {
        if (import.Status != AiOrderImportStatus.Uploaded ||
            import.ActiveProcessingLeaseToken is not null)
        {
            throw new BusinessException(
                AiOrderImportErrorCodes.ModificationNotAllowed,
                "Source documents can be changed only while the import is Uploaded.");
        }
    }

    private static string NormalizeIdempotencyKey(string value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > 128)
            throw new ArgumentException(
                "A non-empty idempotency key of at most 128 characters is required.",
                nameof(value));

        return normalized;
    }

    private static string NormalizeSha256(string value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        if (normalized is null ||
            normalized.Length != 64 ||
            !normalized.All(Uri.IsHexDigit))
        {
            throw new ArgumentException(
                "A 64-character SHA-256 hexadecimal digest is required.",
                nameof(value));
        }

        return normalized;
    }
}

public sealed record AiOrderReviewEventInput(
    AiOrderReviewAction Action,
    string? JsonPointer,
    string? BeforeJson,
    string? AfterJson,
    string? Reason);
