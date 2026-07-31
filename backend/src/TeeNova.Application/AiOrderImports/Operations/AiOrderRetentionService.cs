using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.Auth;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;

namespace TeeNova.AiOrderImports.Operations;

[Authorize(Roles = TeeNovaRoles.Admin)]
[RemoteService(false)]
public class AiOrderRetentionAppService : ApplicationService
{
    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderSourceDocument, Guid> _sources;
    private readonly IRepository<AiOrderProcessingAttempt, Guid> _attempts;
    private readonly IRepository<AiOrderOperationalEvent, Guid> _events;
    private readonly IRepository<AiOrderSourceAccessAudit, Guid> _accessAudits;
    private readonly IRepository<PaymentTransaction, Guid> _payments;
    private readonly IPrivateObjectStorage _storage;
    private readonly AiOrderRetentionOptions _options;
    private readonly IGuidGenerator _guids;
    private readonly TimeProvider _time;
    private readonly AiOrderOperationalTelemetry _telemetry;

    public AiOrderRetentionAppService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderSourceDocument, Guid> sources,
        IRepository<AiOrderProcessingAttempt, Guid> attempts,
        IRepository<AiOrderOperationalEvent, Guid> events,
        IRepository<AiOrderSourceAccessAudit, Guid> accessAudits,
        IRepository<PaymentTransaction, Guid> payments,
        IPrivateObjectStorage storage,
        IOptions<AiOrderRetentionOptions> options,
        IGuidGenerator guids,
        TimeProvider time,
        AiOrderOperationalTelemetry telemetry)
    {
        _imports = imports;
        _sources = sources;
        _attempts = attempts;
        _events = events;
        _accessAudits = accessAudits;
        _payments = payments;
        _storage = storage;
        _options = options.Value;
        _guids = guids;
        _time = time;
        _telemetry = telemetry;
    }

    public virtual async Task<AiOrderRetentionSummaryDto> GetSummaryAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        var now = UtcNow();
        var import = await _imports.GetAsync(importId, false, cancellationToken);
        var sources = await (await _sources.GetQueryableAsync())
            .Where(x => x.ImportId == importId && x.ContentDeletedAt == null)
            .ToListAsync(cancellationToken);
        var attempts = await (await _attempts.GetQueryableAsync())
            .Where(x => x.ImportId == importId &&
                        x.RawResultObjectKey != null &&
                        x.RawResultDeletedAt == null)
            .ToListAsync(cancellationToken);
        return new()
        {
            ImportId = importId,
            RetentionClass = Classify(import),
            RetentionUntil = import.RetentionUntil,
            HoldActive = import.HasActiveRetentionHold(now),
            HoldReason = import.HasActiveRetentionHold(now) ? import.RetentionHoldReason : null,
            HoldExpiresAt = import.HasActiveRetentionHold(now)
                ? import.RetentionHoldExpiresAt
                : null,
            ActiveSourceCount = sources.Count,
            RawEvidenceCount = attempts.Count,
            FailedDeletionCount =
                sources.Count(x => x.DeletionOutcome == AiOrderSourceDeletionOutcome.Failed) +
                attempts.Count(x => x.RawResultDeletionFailureCount > 0),
        };
    }

    public virtual async Task<AiOrderRetentionSummaryDto> PlaceHoldAsync(
        Guid importId,
        PlaceAiOrderRetentionHoldInput input,
        CancellationToken cancellationToken = default)
    {
        var reason = RequireReason(input.Reason);
        var actor = RequireAdminId();
        var now = UtcNow();
        var import = await _imports.GetAsync(importId, false, cancellationToken);
        import.PlaceRetentionHold(reason, actor, now, input.ExpiresAt);
        await _imports.UpdateAsync(import, true, cancellationToken);
        await AppendEventAsync(
            AiOrderOperationalEventType.RetentionHoldPlaced,
            "Admin",
            "Succeeded",
            importId,
            actorAdminId: actor,
            reason: reason,
            expiresAt: input.ExpiresAt,
            cancellationToken: cancellationToken);
        return await GetSummaryAsync(importId, cancellationToken);
    }

    public virtual async Task<AiOrderRetentionSummaryDto> ReleaseHoldAsync(
        Guid importId,
        ReleaseAiOrderRetentionHoldInput input,
        CancellationToken cancellationToken = default)
    {
        var reason = RequireReason(input.Reason);
        var actor = RequireAdminId();
        var import = await _imports.GetAsync(importId, false, cancellationToken);
        import.ReleaseRetentionHold();
        await _imports.UpdateAsync(import, true, cancellationToken);
        await AppendEventAsync(
            AiOrderOperationalEventType.RetentionHoldReleased,
            "Admin",
            "Succeeded",
            importId,
            actorAdminId: actor,
            reason: reason,
            cancellationToken: cancellationToken);
        return await GetSummaryAsync(importId, cancellationToken);
    }

    public virtual async Task<AiOrderRetentionSummaryDto> ExtendAsync(
        Guid importId,
        ExtendAiOrderRetentionInput input,
        CancellationToken cancellationToken = default)
    {
        var now = UtcNow();
        if (input.RetainUntil <= now)
            throw Safe(AiOrderImportErrorCodes.RetentionInputInvalid, "Retention must extend into the future.");
        var reason = RequireReason(input.Reason);
        var actor = RequireAdminId();
        var import = await _imports.GetAsync(importId, false, cancellationToken);
        if (import.RetentionUntil.HasValue && input.RetainUntil < import.RetentionUntil.Value)
            throw Safe(AiOrderImportErrorCodes.RetentionInputInvalid, "Retention cannot be shortened by this action.");

        import.UpdateRetention(Classify(import), input.RetainUntil, import.IsRetentionHeld);
        var sources = await (await _sources.GetQueryableAsync())
            .Where(x => x.ImportId == importId && x.ContentDeletedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var source in sources)
            source.SetRetentionUntil(input.RetainUntil);
        var attempts = await (await _attempts.GetQueryableAsync())
            .Where(x => x.ImportId == importId &&
                        x.RawResultObjectKey != null &&
                        x.RawResultDeletedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var attempt in attempts)
            attempt.SetRawResultRetentionUntil(input.RetainUntil);

        await _imports.UpdateAsync(import, false, cancellationToken);
        if (sources.Count > 0)
            await _sources.UpdateManyAsync(sources, false, cancellationToken);
        if (attempts.Count > 0)
            await _attempts.UpdateManyAsync(attempts, false, cancellationToken);
        await AppendEventAsync(
            AiOrderOperationalEventType.RetentionExtended,
            "Admin",
            "Succeeded",
            importId,
            actorAdminId: actor,
            reason: reason,
            expiresAt: input.RetainUntil,
            cancellationToken: cancellationToken);
        return await GetSummaryAsync(importId, cancellationToken);
    }

    public virtual async Task DeleteSourceAsync(
        Guid importId,
        DeleteAiOrderRetainedBytesInput input,
        CancellationToken cancellationToken = default)
    {
        if (!input.Confirmed || !input.SourceDocumentId.HasValue)
            throw Safe(AiOrderImportErrorCodes.RetentionConfirmationRequired, "Explicit deletion confirmation is required.");
        await DeleteSourceCoreAsync(
            importId,
            input.SourceDocumentId.Value,
            "Admin",
            RequireReason(input.Reason),
            RequireAdminId(),
            requireEligible: true,
            cancellationToken);
    }

    public virtual async Task DeleteRawEvidenceAsync(
        Guid importId,
        DeleteAiOrderRetainedBytesInput input,
        CancellationToken cancellationToken = default)
    {
        if (!input.Confirmed || !input.ProcessingAttemptId.HasValue)
            throw Safe(AiOrderImportErrorCodes.RetentionConfirmationRequired, "Explicit deletion confirmation is required.");
        await DeleteRawCoreAsync(
            importId,
            input.ProcessingAttemptId.Value,
            "Admin",
            RequireReason(input.Reason),
            RequireAdminId(),
            requireEligible: true,
            cancellationToken);
    }

    [AllowAnonymous]
    public virtual async Task<AiOrderRetentionRunResult> RunBatchAsync(
        CancellationToken cancellationToken)
    {
        if (!_options.WorkerEnabled)
            return new(0, 0, 0, "Disabled");

        var started = UtcNow();
        var deadline = started.AddSeconds(_options.MaximumRunSeconds);
        var deletedSources = 0;
        var deletedRaw = 0;
        var failures = 0;

        var sourceCandidates = await (await _sources.GetQueryableAsync())
            .Where(x => x.ContentDeletedAt == null &&
                        (x.RetentionUntil == null ||
                         x.RetentionUntil <= started ||
                         (x.DeletionOutcome == AiOrderSourceDeletionOutcome.Failed &&
                          (x.DeletionNextRetryAt == null || x.DeletionNextRetryAt <= started))))
            .OrderBy(x => x.RetentionUntil)
            .ThenBy(x => x.UploadedAt)
            .Take(_options.BatchSize * 8)
            .Select(x => new { x.ImportId, SourceId = x.Id })
            .ToListAsync(cancellationToken);
        foreach (var candidate in sourceCandidates)
        {
            if (deletedSources + failures >= _options.BatchSize ||
                UtcNow() >= deadline || cancellationToken.IsCancellationRequested)
                break;
            try
            {
                if (await DeleteSourceCoreAsync(
                        candidate.ImportId,
                        candidate.SourceId,
                        "Worker",
                        "Configured retention period expired.",
                        null,
                        requireEligible: true,
                        cancellationToken))
                    deletedSources++;
            }
            catch
            {
                failures++;
            }
        }

        var remaining = Math.Max(0, _options.BatchSize - deletedSources - failures);
        if (remaining > 0 && UtcNow() < deadline)
        {
            var rawCandidates = await (await _attempts.GetQueryableAsync())
                .Where(x => x.RawResultObjectKey != null &&
                            x.RawResultDeletedAt == null &&
                            x.RawResultRetentionUntil != null &&
                            x.RawResultRetentionUntil <= started &&
                            (x.RawResultDeletionNextRetryAt == null ||
                             x.RawResultDeletionNextRetryAt <= started))
                .OrderBy(x => x.RawResultRetentionUntil)
                .Take(remaining * 4)
                .Select(x => new { x.ImportId, AttemptId = x.Id })
                .ToListAsync(cancellationToken);
            foreach (var candidate in rawCandidates.Take(remaining))
            {
                if (UtcNow() >= deadline || cancellationToken.IsCancellationRequested)
                    break;
                try
                {
                    if (await DeleteRawCoreAsync(
                            candidate.ImportId,
                            candidate.AttemptId,
                            "Worker",
                            "Configured raw-provider-evidence retention period expired.",
                            null,
                            requireEligible: true,
                            cancellationToken))
                        deletedRaw++;
                }
                catch
                {
                    failures++;
                }
            }
        }

        var outcome = failures == 0 ? "Succeeded" : "CompletedWithFailures";
        var accessPolicy = _options.GetRequired("AccessAudit");
        if (accessPolicy.DeletionEligible && UtcNow() < deadline)
        {
            var cutoff = started.AddDays(-accessPolicy.RetentionDays);
            var expiredAudits = await (await _accessAudits.GetQueryableAsync())
                .Where(x => x.AccessedAt <= cutoff)
                .OrderBy(x => x.AccessedAt)
                .Take(_options.BatchSize)
                .ToListAsync(cancellationToken);
            if (expiredAudits.Count > 0)
                await _accessAudits.DeleteManyAsync(expiredAudits, true, cancellationToken);
        }
        await AppendEventAsync(
            AiOrderOperationalEventType.RetentionWorkerCompleted,
            "Worker",
            outcome,
            reason: $"source={deletedSources};raw={deletedRaw};failed={failures}",
            cancellationToken: cancellationToken);
        return new(deletedSources, deletedRaw, failures, outcome);
    }

    private async Task<bool> DeleteSourceCoreAsync(
        Guid importId,
        Guid sourceId,
        string actorType,
        string reason,
        Guid? actorAdminId,
        bool requireEligible,
        CancellationToken cancellationToken)
    {
        var now = UtcNow();
        var import = await _imports.GetAsync(importId, false, cancellationToken);
        if (import.HasActiveRetentionHold(now))
        {
            if (actorType == "Admin")
                throw Safe(AiOrderImportErrorCodes.RetentionHoldActive, "An active retention hold blocks deletion.");
            return false;
        }
        if (import.Status == AiOrderImportStatus.Processing &&
            import.ActiveProcessingLeaseExpiresAt > now)
            return false;
        var source = await _sources.GetAsync(sourceId, false, cancellationToken);
        if (source.ImportId != importId || source.ContentDeletedAt.HasValue)
            return false;
        var policyName = Classify(import);
        var policy = _options.GetRequired(policyName);
        if (!policy.DeletionEligible || !policy.DeleteSourceBytes)
            return false;
        if (policy.OrderPaymentRetentionOverrides && await HasPaymentFootprintAsync(import, cancellationToken))
            return false;
        var eligibleAt = source.RetentionUntil ??
                         import.RetentionUntil ??
                         RetentionBase(import, source.UploadedAt).AddDays(policy.RetentionDays);
        if (requireEligible && eligibleAt > now)
        {
            if (actorType == "Admin")
                throw Safe(AiOrderImportErrorCodes.RetentionNotEligible, "Source content is not yet eligible for deletion.");
            return false;
        }

        try
        {
            await _storage.DeleteAsync(source.PrivateObjectKey, cancellationToken);
            source.MarkContentDeleted(now);
            await _sources.UpdateAsync(source, true, cancellationToken);
            await AppendEventAsync(
                AiOrderOperationalEventType.SourceDeleted,
                actorType,
                "Succeeded",
                importId,
                sourceId,
                actorAdminId: actorAdminId,
                reason: reason,
                cancellationToken: cancellationToken);
            _telemetry.RecordRetention("source", "succeeded");
            return true;
        }
        catch (BusinessException)
        {
            throw;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            var retryAt = now.Add(Backoff(source.DeletionFailureCount + 1));
            source.MarkDeletionFailed("PRIVATE_OBJECT_DELETE_FAILED", retryAt);
            await _sources.UpdateAsync(source, true, cancellationToken);
            await AppendEventAsync(
                AiOrderOperationalEventType.SourceDeletionFailed,
                actorType,
                "Failed",
                importId,
                sourceId,
                actorAdminId: actorAdminId,
                reason: reason,
                safeErrorCode: "PRIVATE_OBJECT_DELETE_FAILED",
                expiresAt: retryAt,
                cancellationToken: cancellationToken);
            _telemetry.RecordRetention("source", "failed");
            throw Safe(AiOrderImportErrorCodes.PrivateStorageFailure, "Source deletion failed and is safely retryable.");
        }
    }

    private async Task<bool> DeleteRawCoreAsync(
        Guid importId,
        Guid attemptId,
        string actorType,
        string reason,
        Guid? actorAdminId,
        bool requireEligible,
        CancellationToken cancellationToken)
    {
        var now = UtcNow();
        var import = await _imports.GetAsync(importId, false, cancellationToken);
        if (import.HasActiveRetentionHold(now))
        {
            if (actorType == "Admin")
                throw Safe(AiOrderImportErrorCodes.RetentionHoldActive, "An active retention hold blocks deletion.");
            return false;
        }
        if (import.Status == AiOrderImportStatus.Processing &&
            import.ActiveProcessingLeaseExpiresAt > now)
            return false;
        var attempt = await _attempts.GetAsync(attemptId, false, cancellationToken);
        if (attempt.ImportId != importId || attempt.RawResultObjectKey is null ||
            attempt.RawResultDeletedAt.HasValue)
            return false;
        var policy = _options.GetRequired("RawProviderEvidence");
        if (!policy.DeletionEligible || !policy.DeleteRawProviderEvidence)
            return false;
        var eligibleAt = attempt.RawResultRetentionUntil ??
                         (attempt.CompletedAt ?? attempt.SubmittedAt).AddDays(policy.RetentionDays);
        if (requireEligible && eligibleAt > now)
        {
            if (actorType == "Admin")
                throw Safe(AiOrderImportErrorCodes.RetentionNotEligible, "Raw provider evidence is not yet eligible for deletion.");
            return false;
        }

        try
        {
            await _storage.DeleteAsync(attempt.RawResultObjectKey, cancellationToken);
            if (!attempt.RawResultRetentionUntil.HasValue)
                attempt.SetRawResultRetentionUntil(eligibleAt);
            attempt.MarkRawResultDeleted(now);
            await _attempts.UpdateAsync(attempt, true, cancellationToken);
            await AppendEventAsync(
                AiOrderOperationalEventType.RawEvidenceDeleted,
                actorType,
                "Succeeded",
                importId,
                processingAttemptId: attemptId,
                actorAdminId: actorAdminId,
                reason: reason,
                cancellationToken: cancellationToken);
            _telemetry.RecordRetention("raw_evidence", "succeeded");
            return true;
        }
        catch (BusinessException)
        {
            throw;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            var retryAt = now.Add(Backoff(attempt.RawResultDeletionFailureCount + 1));
            attempt.MarkRawResultDeletionFailed("PRIVATE_OBJECT_DELETE_FAILED", retryAt);
            await _attempts.UpdateAsync(attempt, true, cancellationToken);
            await AppendEventAsync(
                AiOrderOperationalEventType.RawEvidenceDeletionFailed,
                actorType,
                "Failed",
                importId,
                processingAttemptId: attemptId,
                actorAdminId: actorAdminId,
                reason: reason,
                safeErrorCode: "PRIVATE_OBJECT_DELETE_FAILED",
                expiresAt: retryAt,
                cancellationToken: cancellationToken);
            _telemetry.RecordRetention("raw_evidence", "failed");
            throw Safe(AiOrderImportErrorCodes.PrivateStorageFailure, "Raw evidence deletion failed and is safely retryable.");
        }
    }

    public static string Classify(AiOrderImport import) =>
        import.FormalOrderId.HasValue ? "Materialized" :
        import.Status switch
        {
            AiOrderImportStatus.Uploaded => "UploadedAbandoned",
            AiOrderImportStatus.Processing or AiOrderImportStatus.Failed => "ProcessingFailed",
            AiOrderImportStatus.Cancelled => "Cancelled",
            AiOrderImportStatus.NeedsReview => "NeedsReview",
            AiOrderImportStatus.Draft => "Draft",
            AiOrderImportStatus.Confirmed => "ConfirmedUnmaterialized",
            _ => "UploadedAbandoned",
        };

    private static DateTime RetentionBase(AiOrderImport import, DateTime fallback) =>
        import.MaterializedAt ?? import.ConfirmedAt ?? import.CancelledAt ?? fallback;

    private async Task<bool> HasPaymentFootprintAsync(
        AiOrderImport import,
        CancellationToken cancellationToken)
    {
        if (!import.FormalOrderId.HasValue)
            return false;
        return await (await _payments.GetQueryableAsync())
            .AnyAsync(x => x.OrderId == import.FormalOrderId.Value, cancellationToken);
    }

    private TimeSpan Backoff(int failureCount)
    {
        var multiplier = Math.Pow(2, Math.Clamp(failureCount - 1, 0, 16));
        var minutes = Math.Min(
            _options.RetryMaximumMinutes,
            _options.RetryBaseMinutes * multiplier);
        return TimeSpan.FromMinutes(minutes);
    }

    private Task<AiOrderOperationalEvent> AppendEventAsync(
        AiOrderOperationalEventType eventType,
        string actorType,
        string outcome,
        Guid? importId = null,
        Guid? sourceDocumentId = null,
        Guid? processingAttemptId = null,
        Guid? actorAdminId = null,
        string? reason = null,
        string? safeErrorCode = null,
        DateTime? expiresAt = null,
        CancellationToken cancellationToken = default) =>
        _events.InsertAsync(
            new AiOrderOperationalEvent(
                _guids.Create(),
                eventType,
                actorType,
                outcome,
                UtcNow(),
                importId,
                sourceDocumentId,
                processingAttemptId,
                actorAdminId,
                reason,
                safeErrorCode,
                expiresAt),
            true,
            cancellationToken);

    private Guid RequireAdminId() =>
        CurrentUser.Id ??
        throw Safe(AiOrderImportErrorCodes.InvalidRequest, "The authenticated Admin identity is unavailable.");

    private static string RequireReason(string reason)
    {
        var value = reason?.Trim();
        if (string.IsNullOrWhiteSpace(value) || value.Length > 500)
            throw Safe(AiOrderImportErrorCodes.RetentionInputInvalid, "A retention reason is required.");
        return value;
    }

    private DateTime UtcNow() => _time.GetUtcNow().UtcDateTime;

    private static BusinessException Safe(string code, string message) => new(code, message);
}

public sealed record AiOrderRetentionRunResult(
    int SourcesDeleted,
    int RawEvidenceDeleted,
    int Failures,
    string Outcome);
