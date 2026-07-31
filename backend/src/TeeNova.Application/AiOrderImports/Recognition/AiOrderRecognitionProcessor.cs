using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.AiOrderImports.Validation;
using Volo.Abp;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;
using Volo.Abp.Uow;

namespace TeeNova.AiOrderImports.Recognition;

public sealed class AiOrderRecognitionProcessor : ITransientDependency
{
    private static readonly JsonSerializerOptions SnapshotJsonOptions =
        new(JsonSerializerDefaults.Web);

    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderProcessingAttempt, Guid> _attempts;
    private readonly AiOrderImportFoundationService _foundation;
    private readonly IAiOrderRecognitionProviderRegistry _providers;
    private readonly IAiOrderRecognitionModelRegistry _models;
    private readonly IAiOrderRecognitionPromptBuilder _promptBuilder;
    private readonly IAiOrderRecognitionStructuralValidator _validator;
    private readonly IAiOrderRecognitionCostEstimator _costs;
    private readonly AiOrderRecognitionSourcePreparer _sourcePreparer;
    private readonly IPrivateObjectStorage _privateStorage;
    private readonly AiOrderRecognitionOptions _options;
    private readonly IGuidGenerator _guidGenerator;
    private readonly IUnitOfWorkManager _unitOfWorkManager;
    private readonly TimeProvider _timeProvider;
    private readonly AiOrderExtractionValidationProcessor _validationProcessor;

    public AiOrderRecognitionProcessor(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderProcessingAttempt, Guid> attempts,
        AiOrderImportFoundationService foundation,
        IAiOrderRecognitionProviderRegistry providers,
        IAiOrderRecognitionModelRegistry models,
        IAiOrderRecognitionPromptBuilder promptBuilder,
        IAiOrderRecognitionStructuralValidator validator,
        IAiOrderRecognitionCostEstimator costs,
        AiOrderRecognitionSourcePreparer sourcePreparer,
        IPrivateObjectStorage privateStorage,
        IOptions<AiOrderRecognitionOptions> options,
        IGuidGenerator guidGenerator,
        IUnitOfWorkManager unitOfWorkManager,
        TimeProvider timeProvider,
        AiOrderExtractionValidationProcessor validationProcessor)
    {
        _imports = imports;
        _attempts = attempts;
        _foundation = foundation;
        _providers = providers;
        _models = models;
        _promptBuilder = promptBuilder;
        _validator = validator;
        _costs = costs;
        _sourcePreparer = sourcePreparer;
        _privateStorage = privateStorage;
        _options = options.Value;
        _guidGenerator = guidGenerator;
        _unitOfWorkManager = unitOfWorkManager;
        _timeProvider = timeProvider;
        _validationProcessor = validationProcessor;
    }

    public async Task<string?> TryClaimAsync(
        Guid attemptId,
        CancellationToken cancellationToken)
    {
        using var unitOfWork = _unitOfWorkManager.Begin(
            requiresNew: true,
            isTransactional: true);
        try
        {
            var attempt = await _attempts.GetAsync(
                attemptId,
                includeDetails: false,
                cancellationToken);
            if (attempt.Outcome != AiOrderProcessingAttemptOutcome.Processing)
                return null;

            var import = await _imports.GetAsync(
                attempt.ImportId,
                includeDetails: false,
                cancellationToken);
            var now = UtcNow();
            if (import.Status != AiOrderImportStatus.Processing ||
                !string.Equals(
                    import.ActiveProcessingLeaseToken,
                    attempt.LeaseToken,
                    StringComparison.Ordinal))
                return null;
            if (import.ActiveProcessingLeaseExpiresAt <= now)
            {
                import.RenewProcessingLease(
                    attempt.LeaseToken,
                    now.AddMinutes(_options.LeaseMinutes),
                    now);
                await _imports.UpdateAsync(import, autoSave: false, cancellationToken);
            }

            var claimToken = _guidGenerator.Create().ToString("N");
            attempt.ClaimWorker(
                claimToken,
                now.AddMinutes(_options.LeaseMinutes),
                now);
            await _attempts.UpdateAsync(attempt, autoSave: false, cancellationToken);
            await unitOfWork.CompleteAsync(cancellationToken);
            return claimToken;
        }
        catch (AbpDbConcurrencyException)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<Guid>> GetDueRetryImportIdsAsync(
        int maximum,
        CancellationToken cancellationToken)
    {
        using var unitOfWork = _unitOfWorkManager.Begin(
            requiresNew: true,
            isTransactional: false);
        var now = UtcNow();
        var query = await _imports.GetQueryableAsync();
        var ids = await query
            .Where(x => x.Status == AiOrderImportStatus.Failed &&
                        x.NextRetryAt != null &&
                        x.NextRetryAt <= now)
            .OrderBy(x => x.NextRetryAt)
            .Select(x => x.Id)
            .Take(maximum)
            .ToListAsync(cancellationToken);
        await unitOfWork.CompleteAsync(cancellationToken);
        return ids;
    }

    public async Task<IReadOnlyList<Guid>> GetProcessingCandidateIdsAsync(
        int maximum,
        CancellationToken cancellationToken)
    {
        using var unitOfWork = _unitOfWorkManager.Begin(
            requiresNew: true,
            isTransactional: false);
        var now = UtcNow();
        var query = await _attempts.GetQueryableAsync();
        var ids = await query
            .Where(x => x.Outcome == AiOrderProcessingAttemptOutcome.Processing &&
                        (x.WorkerClaimExpiresAt == null ||
                         x.WorkerClaimExpiresAt <= now))
            .OrderBy(x => x.SubmittedAt)
            .Select(x => x.Id)
            .Take(maximum)
            .ToListAsync(cancellationToken);
        await unitOfWork.CompleteAsync(cancellationToken);
        return ids;
    }

    public async Task<bool> TryQueueAutomaticRetryAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        using var unitOfWork = _unitOfWorkManager.Begin(
            requiresNew: true,
            isTransactional: true);
        try
        {
            var import = await _imports.GetAsync(
                importId,
                includeDetails: false,
                cancellationToken);
            var now = UtcNow();
            if (import.Status != AiOrderImportStatus.Failed ||
                !import.NextRetryAt.HasValue ||
                import.NextRetryAt.Value > now)
                return false;

            var query = await _attempts.GetQueryableAsync();
            var attempts = await query
                .Where(x => x.ImportId == importId)
                .OrderBy(x => x.AttemptNumber)
                .ToListAsync(cancellationToken);
            var previous = attempts.LastOrDefault();
            if (previous?.IsRetryable != true ||
                attempts.Count >= _options.MaximumAttemptsPerImport ||
                previous.Provider is null ||
                previous.Model is null ||
                previous.ApiMode is null ||
                previous.ApiVersion is null ||
                previous.PromptVersion is null ||
                previous.ContractVersion is null ||
                previous.StructuredOutputMode is null ||
                previous.PricingVersion is null ||
                previous.PricingSnapshotJson is null ||
                previous.SourceSnapshotJson is null ||
                previous.StartRequestHash is null ||
                !previous.EstimatedCostUsd.HasValue)
                return false;

            // Fail closed when an operator disabled the exact historical selection.
            _models.ResolveEnabled(previous.Provider, previous.Model);
            var monthStart = new DateTime(
                now.Year,
                now.Month,
                1,
                0,
                0,
                0,
                DateTimeKind.Utc);
            var monthEstimate = await query
                .Where(x => x.SubmittedAt >= monthStart && x.EstimatedCostUsd != null)
                .SumAsync(x => x.EstimatedCostUsd ?? 0, cancellationToken);
            if (monthEstimate + previous.EstimatedCostUsd.Value >
                _options.MaximumEstimatedCostUsdPerMonth)
                return false;

            var leaseToken = _guidGenerator.Create().ToString("N");
            import.ClaimProcessingLease(
                leaseToken,
                now.AddMinutes(_options.LeaseMinutes),
                now);
            var attempt = new AiOrderProcessingAttempt(
                _guidGenerator.Create(),
                importId,
                attempts.Count + 1,
                leaseToken,
                previous.Provider,
                previous.Model,
                now);
            attempt.ConfigureRecognition(
                previous.ApiMode,
                previous.ApiVersion,
                previous.PromptVersion,
                previous.ContractVersion,
                previous.StructuredOutputMode,
                previous.PricingVersion,
                previous.PricingSnapshotJson,
                previous.SourceSnapshotJson,
                $"auto-retry:{previous.Id:N}",
                previous.StartRequestHash,
                previous.EstimatedCostUsd.Value);
            await _attempts.InsertAsync(attempt, autoSave: false, cancellationToken);
            await _imports.UpdateAsync(import, autoSave: false, cancellationToken);
            await unitOfWork.CompleteAsync(cancellationToken);
            return true;
        }
        catch (AbpDbConcurrencyException)
        {
            return false;
        }
        catch (DbUpdateException)
        {
            return false;
        }
        catch (BusinessException)
        {
            return false;
        }
    }

    public async Task CleanupExpiredRawEvidenceAsync(
        CancellationToken cancellationToken)
    {
        var now = UtcNow();
        AiOrderProcessingAttempt[] expired;
        using (var unitOfWork = _unitOfWorkManager.Begin(
                   requiresNew: true,
                   isTransactional: false))
        {
            var query = await _attempts.GetQueryableAsync();
            expired = await query
                .Where(x => x.RawResultObjectKey != null &&
                            x.RawResultRetentionUntil != null &&
                            x.RawResultRetentionUntil <= now &&
                            x.RawResultDeletedAt == null)
                .OrderBy(x => x.RawResultRetentionUntil)
                .Take(10)
                .ToArrayAsync(cancellationToken);
            await unitOfWork.CompleteAsync(cancellationToken);
        }

        foreach (var candidate in expired)
        {
            try
            {
                await _privateStorage.DeleteAsync(
                    candidate.RawResultObjectKey!,
                    cancellationToken);
            }
            catch
            {
                // A later bounded sweep retries without exposing the private object key.
                continue;
            }
            using var unitOfWork = _unitOfWorkManager.Begin(
                requiresNew: true,
                isTransactional: true);
            var current = await _attempts.GetAsync(
                candidate.Id,
                includeDetails: false,
                cancellationToken);
            if (!current.RawResultDeletedAt.HasValue)
            {
                current.MarkRawResultDeleted(now);
                await _attempts.UpdateAsync(
                    current,
                    autoSave: false,
                    cancellationToken);
            }
            await unitOfWork.CompleteAsync(cancellationToken);
        }
    }

    public async Task ProcessClaimedAsync(
        Guid attemptId,
        string workerClaimToken,
        CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        AiOrderProcessingAttempt attempt;
        AiOrderImport import;
        using (var unitOfWork = _unitOfWorkManager.Begin(
                         requiresNew: true,
                         isTransactional: false))
        {
            attempt = await _attempts.GetAsync(
                attemptId,
                includeDetails: false,
                cancellationToken);
            import = await _imports.GetAsync(
                attempt.ImportId,
                includeDetails: false,
                cancellationToken);
            await unitOfWork.CompleteAsync(cancellationToken);
        }

        string? rawObjectKey = null;
        try
        {
            if (attempt.Outcome != AiOrderProcessingAttemptOutcome.Processing ||
                !string.Equals(
                    attempt.WorkerClaimToken,
                    workerClaimToken,
                    StringComparison.Ordinal))
                return;

            var selection = _models.ResolveEnabled(
                attempt.Provider ?? string.Empty,
                attempt.Model ?? string.Empty);
            selection = WithAttemptPricing(selection, attempt.PricingSnapshotJson);
            var sourceSnapshot = JsonSerializer.Deserialize<
                AiOrderRecognitionSourceDescriptor[]>(
                attempt.SourceSnapshotJson ??
                throw new BusinessException("TeeNova:AiOrderImport:AttemptSourceSnapshotMissing"),
                SnapshotJsonOptions) ?? [];
            var sources = await _sourcePreparer.PrepareAsync(
                attempt.ImportId,
                sourceSnapshot,
                cancellationToken);
            var request = new AiOrderRecognitionRequest(
                attempt.ImportId,
                attempt.Id,
                selection.ProviderId,
                selection.ModelId,
                attempt.PromptVersion ?? AiOrderRecognitionVersions.Prompt,
                attempt.ContractVersion ?? AiOrderRecognitionVersions.Contract,
                _options.CurrencyContext,
                _options.LocaleContext,
                _promptBuilder.Build(_options.CurrencyContext, _options.LocaleContext),
                _validator.JsonSchema,
                sources);
            var provider = _providers.Resolve(selection.ProviderId);
            var aggregateUsage = new AiOrderRecognitionUsage(0, 0, 0);
            AiOrderRecognitionResult? result = null;
            AiOrderStructuralValidationResult? validated = null;
            for (var repair = 0; repair < 2; repair++)
            {
                result = await provider.RecognizeAsync(request, cancellationToken);
                aggregateUsage = AddUsage(aggregateUsage, result.Usage);
                try
                {
                    validated = _validator.ValidateAndCanonicalize(
                        result.StructuredOutputJson);
                    _validator.ValidateSourceReferences(
                        validated.CanonicalJson,
                        sourceSnapshot.ToDictionary(x => x.Id, x => x.PageCount));
                    break;
                }
                catch (BusinessException) when (repair == 0)
                {
                    await MarkRepairAttemptedAsync(attempt.Id, cancellationToken);
                    request = request with
                    {
                        Prompt = request.Prompt +
                                 "\nThe previous response failed structural validation. " +
                                 "Return a fresh response matching the schema exactly.",
                    };
                }
            }
            if (result is null || validated is null)
                throw new AiOrderRecognitionProviderException(
                    "RecognitionStructuredOutputInvalid",
                    false);

            var rawHash = Convert
                .ToHexString(SHA256.HashData(result.RawResponse))
                .ToLowerInvariant();
            if (_options.RetainRawProviderEvidence)
            {
                await using var rawStream = new MemoryStream(
                    result.RawResponse,
                    writable: false);
                rawObjectKey = await _privateStorage.SaveAsync(
                    rawStream,
                    PrivateObjectCategory.RawProviderEvidence,
                    cancellationToken);
            }
            var actualCost = _costs.CalculateActual(selection, aggregateUsage);
            await _foundation.CompleteProcessingAttemptAsync(
                attempt.ImportId,
                attempt.LeaseToken,
                import.CurrentRevision,
                AiOrderRecognitionVersions.StructuralValidation,
                validated.CanonicalJson,
                validated.CanonicalSha256,
                import.CreatedByAdminId,
                result.ProviderRequestId,
                rawObjectKey,
                rawHash,
                aggregateUsage.InputTokens,
                aggregateUsage.OutputTokens,
                aggregateUsage.CachedInputTokens,
                result.FinishReason,
                actualCost,
                stopwatch.ElapsedMilliseconds,
                _options.RetainRawProviderEvidence
                    ? UtcNow().AddDays(_options.RawResultRetentionDays)
                    : null,
                workerClaimToken,
                cancellationToken);
            await _validationProcessor.TryValidateAfterRecognitionAsync(
                attempt.ImportId,
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            if (rawObjectKey is not null)
                await DeleteRawQuietlyAsync(rawObjectKey);
            throw;
        }
        catch (Exception exception)
        {
            if (rawObjectKey is not null)
                await DeleteRawQuietlyAsync(rawObjectKey);
            await FailSafelyAsync(
                attempt,
                workerClaimToken,
                exception,
                cancellationToken);
        }
    }

    public static TimeSpan CalculateRetryDelay(
        int retryNumber,
        int baseSeconds,
        int maximumSeconds,
        TimeSpan? retryAfter,
        double jitterUnit)
    {
        if (retryAfter.HasValue)
            return retryAfter.Value > TimeSpan.FromSeconds(maximumSeconds)
                ? TimeSpan.FromSeconds(maximumSeconds)
                : retryAfter.Value;
        var exponent = Math.Min(20, Math.Max(0, retryNumber));
        var uncapped = baseSeconds * Math.Pow(2, exponent);
        var capped = Math.Min(maximumSeconds, uncapped);
        var boundedJitter = Math.Clamp(jitterUnit, 0, 1) * Math.Min(baseSeconds, capped * 0.25);
        return TimeSpan.FromSeconds(Math.Min(maximumSeconds, capped + boundedJitter));
    }

    private async Task MarkRepairAttemptedAsync(
        Guid attemptId,
        CancellationToken cancellationToken)
    {
        using var unitOfWork = _unitOfWorkManager.Begin(
            requiresNew: true,
            isTransactional: true);
        var attempt = await _attempts.GetAsync(
            attemptId,
            includeDetails: false,
            cancellationToken);
        attempt.MarkRepairAttempted();
        await _attempts.UpdateAsync(attempt, autoSave: false, cancellationToken);
        await unitOfWork.CompleteAsync(cancellationToken);
    }

    private async Task FailSafelyAsync(
        AiOrderProcessingAttempt attempt,
        string workerClaimToken,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var providerFailure = exception as AiOrderRecognitionProviderException;
        var retryable = providerFailure?.IsRetryable == true;
        var safeCode = providerFailure?.SafeCode ??
                       (exception is BusinessException business
                           ? business.Code ?? "RecognitionProcessingFailed"
                           : "RecognitionProcessingFailed");
        var nextRetry = retryable
            ? UtcNow().Add(CalculateRetryDelay(
                attempt.AttemptNumber,
                _options.RetryBaseSeconds,
                _options.RetryMaximumSeconds,
                providerFailure?.RetryAfter,
                0.5))
            : (DateTime?)null;
        try
        {
            await _foundation.FailProcessingAttemptAsync(
                attempt.ImportId,
                attempt.LeaseToken,
                safeCode.Length > 128 ? "RecognitionProcessingFailed" : safeCode,
                retryable,
                nextRetry,
                providerFailure?.ProviderRequestId,
                workerClaimToken,
                cancellationToken);
        }
        catch (BusinessException)
        {
            // A cancelled import or a newer worker claim makes this result stale; never overwrite it.
        }
    }

    private async Task DeleteRawQuietlyAsync(string objectKey)
    {
        try
        {
            await _privateStorage.DeleteAsync(objectKey);
        }
        catch
        {
            // Persistence failure remains the primary failure. Retention cleanup can sweep the orphan.
        }
    }

    private static AiOrderRecognitionUsage AddUsage(
        AiOrderRecognitionUsage left,
        AiOrderRecognitionUsage right) =>
        new(
            Add(left.InputTokens, right.InputTokens),
            Add(left.OutputTokens, right.OutputTokens),
            Add(left.CachedInputTokens, right.CachedInputTokens));

    private static long? Add(long? left, long? right) =>
        left.HasValue || right.HasValue ? (left ?? 0) + (right ?? 0) : null;

    private static AiOrderRecognitionModelSelection WithAttemptPricing(
        AiOrderRecognitionModelSelection selection,
        string? snapshotJson)
    {
        if (string.IsNullOrWhiteSpace(snapshotJson))
            return selection;
        var snapshot = JsonSerializer.Deserialize<PricingSnapshot>(
            snapshotJson,
            SnapshotJsonOptions);
        return snapshot is null
            ? selection
            : selection with
            {
                PricingVersion = snapshot.PricingVersion,
                InputUsdPerMillionTokens = snapshot.InputUsdPerMillionTokens,
                CachedInputUsdPerMillionTokens =
                    snapshot.CachedInputUsdPerMillionTokens,
                OutputUsdPerMillionTokens = snapshot.OutputUsdPerMillionTokens,
            };
    }

    private DateTime UtcNow() => _timeProvider.GetUtcNow().UtcDateTime;

    private sealed record PricingSnapshot(
        string PricingVersion,
        decimal InputUsdPerMillionTokens,
        decimal CachedInputUsdPerMillionTokens,
        decimal OutputUsdPerMillionTokens);
}
