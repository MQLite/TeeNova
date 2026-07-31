using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.AiOrderImports.Recognition;
using TeeNova.Auth;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.AiOrderImports.Operations;

[Authorize(Roles = TeeNovaRoles.Admin)]
[RemoteService(false)]
public class AiOrderOperationsAppService : ApplicationService
{
    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderSourceDocument, Guid> _sources;
    private readonly IRepository<AiOrderProcessingAttempt, Guid> _attempts;
    private readonly IRepository<AiOrderOperationalEvent, Guid> _events;
    private readonly IRepository<AiOrderSourceAccessAudit, Guid> _accessAudits;
    private readonly AiOrderFeatureOptions _features;
    private readonly AiOrderOperationsOptions _operations;
    private readonly AiOrderRecognitionOptions _recognition;
    private readonly AiOrderProviderReadiness _providerReadiness;
    private readonly IHostEnvironment _environment;
    private readonly IServiceProvider _services;
    private readonly TimeProvider _time;

    public AiOrderOperationsAppService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderSourceDocument, Guid> sources,
        IRepository<AiOrderProcessingAttempt, Guid> attempts,
        IRepository<AiOrderOperationalEvent, Guid> events,
        IRepository<AiOrderSourceAccessAudit, Guid> accessAudits,
        IOptions<AiOrderFeatureOptions> features,
        IOptions<AiOrderOperationsOptions> operations,
        IOptions<AiOrderRecognitionOptions> recognition,
        AiOrderProviderReadiness providerReadiness,
        IHostEnvironment environment,
        IServiceProvider services,
        TimeProvider time)
    {
        _imports = imports;
        _sources = sources;
        _attempts = attempts;
        _events = events;
        _accessAudits = accessAudits;
        _features = features.Value;
        _operations = operations.Value;
        _recognition = recognition.Value;
        _providerReadiness = providerReadiness;
        _environment = environment;
        _services = services;
        _time = time;
    }

    public virtual async Task<AiOrderOperationsStatusDto> GetStatusAsync(
        CancellationToken cancellationToken = default)
    {
        if (!_features.OperationalStatusVisibleToAdmin)
            throw new BusinessException(
                AiOrderImportErrorCodes.OperationsStatusDisabled,
                "AI Order operational status is disabled.");

        var now = _time.GetUtcNow().UtcDateTime;
        var providers = _providerReadiness.Evaluate(
            _recognition,
            _features,
            _environment.EnvironmentName);
        var blockers = new List<string>();
        var warnings = new List<string>();
        var storage = await CheckStorageAsync(cancellationToken);
        if (storage.Status != PrivateStorageReadinessStatus.Ready)
            blockers.Add($"Private storage: {Display(storage.Status)}.");

        var migrations = await CheckMigrationsAsync(cancellationToken);
        if (!migrations.RuntimeSchemaCurrent)
            blockers.Add("Required AI Order migrations are not applied.");

        if (_features.RecognitionEnabled && providers.All(x => x.Status != "Ready"))
            blockers.Add("Recognition is enabled but no provider is ready.");
        foreach (var provider in providers.Where(x => x.Status is not ("Ready" or "Disabled")))
            warnings.Add($"{provider.DisplayName}: {provider.Status}.");

        if (!migrations.RuntimeSchemaCurrent)
        {
            return new()
            {
                Environment = _environment.EnvironmentName,
                GeneratedAt = now,
                OverallStatus = "Blocked",
                Features = FeatureStatus(),
                Migrations = migrations,
                PrivateStorageStatus = Display(storage.Status),
                PrivateStorageAvailableBytes = storage.AvailableBytes,
                Providers = providers,
                MaximumMonthlyTotalCostUsd = _operations.MaximumMonthlyTotalCostUsd,
                Warnings = warnings,
                Blockers = blockers,
            };
        }

        var attemptQuery = await _attempts.GetQueryableAsync();
        var importQuery = await _imports.GetQueryableAsync();
        var sourceQuery = await _sources.GetQueryableAsync();
        var accessQuery = await _accessAudits.GetQueryableAsync();
        var monthStart = PeriodStart(now, monthly: true);
        var cap = _operations.StatusMaximumCount;
        var active = await attemptQuery.CountAsync(
            x => x.Outcome == AiOrderProcessingAttemptOutcome.Processing,
            cancellationToken);
        var expired = await attemptQuery.CountAsync(
            x => x.Outcome == AiOrderProcessingAttemptOutcome.Processing &&
                 x.WorkerClaimExpiresAt != null && x.WorkerClaimExpiresAt <= now,
            cancellationToken);
        var retryable = await attemptQuery.CountAsync(
            x => x.Outcome == AiOrderProcessingAttemptOutcome.RetryableFailure,
            cancellationToken);
        var deletionBacklog = await sourceQuery.CountAsync(
            x => x.ContentDeletedAt == null && x.RetentionUntil != null && x.RetentionUntil <= now,
            cancellationToken) +
            await attemptQuery.CountAsync(
                x => x.RawResultObjectKey != null &&
                     x.RawResultDeletedAt == null &&
                     x.RawResultRetentionUntil != null &&
                     x.RawResultRetentionUntil <= now,
                cancellationToken);
        var failedDeletion = await sourceQuery.CountAsync(
            x => x.ContentDeletedAt == null &&
                 x.DeletionOutcome == AiOrderSourceDeletionOutcome.Failed,
            cancellationToken) +
            await attemptQuery.CountAsync(
                x => x.RawResultDeletedAt == null && x.RawResultDeletionFailureCount > 0,
                cancellationToken);
        var monthAttempts = await attemptQuery
            .Where(x => x.SubmittedAt >= monthStart)
            .Select(x => new { x.EstimatedCostUsd, x.ActualCostUsd })
            .Take(cap)
            .ToListAsync(cancellationToken);
        var lastWorker = await (await _events.GetQueryableAsync())
            .Where(x => x.EventType == AiOrderOperationalEventType.RetentionWorkerCompleted)
            .OrderByDescending(x => x.OccurredAt)
            .FirstOrDefaultAsync(cancellationToken);

        return new()
        {
            Environment = _environment.EnvironmentName,
            GeneratedAt = now,
            OverallStatus = blockers.Count > 0
                ? "Blocked"
                : warnings.Count > 0 ? "Warning" : "Ready",
            Features = FeatureStatus(),
            Migrations = migrations,
            PrivateStorageStatus = Display(storage.Status),
            PrivateStorageAvailableBytes = storage.AvailableBytes,
            Providers = providers,
            QueuedRecognitionJobs = Math.Min(cap, active),
            ActiveRecognitionLeases = Math.Min(
                cap,
                await importQuery.CountAsync(
                    x => x.Status == AiOrderImportStatus.Processing &&
                         x.ActiveProcessingLeaseExpiresAt > now,
                    cancellationToken)),
            ExpiredOrStuckLeases = Math.Min(cap, expired),
            RetryableFailures = Math.Min(cap, retryable),
            DeletionBacklog = Math.Min(cap, deletionBacklog),
            FailedDeletionCount = Math.Min(cap, failedDeletion),
            ActiveRetentionHolds = Math.Min(
                cap,
                await importQuery.CountAsync(
                    x => x.IsRetentionHeld &&
                         (x.RetentionHoldExpiresAt == null || x.RetentionHoldExpiresAt > now),
                    cancellationToken)),
            SourceAccessesLast24Hours = Math.Min(
                cap,
                await accessQuery.CountAsync(
                    x => x.AccessedAt >= now.AddDays(-1),
                    cancellationToken)),
            DeniedSourceAccessesLast24Hours = Math.Min(
                cap,
                await accessQuery.CountAsync(
                    x => x.AccessedAt >= now.AddDays(-1) && !x.Succeeded,
                    cancellationToken)),
            CurrentMonthProviderCalls = monthAttempts.Count,
            CurrentMonthEstimatedCostUsd = monthAttempts.Sum(x => x.EstimatedCostUsd ?? 0),
            CurrentMonthActualCostUsd = monthAttempts.Sum(x => x.ActualCostUsd ?? 0),
            MaximumMonthlyTotalCostUsd = _operations.MaximumMonthlyTotalCostUsd,
            LastRetentionWorkerRunAt = lastWorker?.OccurredAt,
            LastRetentionWorkerOutcome = lastWorker?.Outcome,
            Warnings = warnings,
            Blockers = blockers,
        };
    }

    private async Task<PrivateStorageReadinessResult> CheckStorageAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            return await _services.GetRequiredService<IPrivateObjectStorage>()
                .CheckReadinessAsync(cancellationToken);
        }
        catch (UnauthorizedAccessException)
        {
            return new(PrivateStorageReadinessStatus.PermissionDenied);
        }
        catch (InvalidOperationException)
        {
            return new(PrivateStorageReadinessStatus.UnsafeLocation);
        }
        catch
        {
            return new(PrivateStorageReadinessStatus.WriteTestFailed);
        }
    }

    private AiOrderFeatureStatusDto FeatureStatus() => new()
    {
        Enabled = _features.Enabled,
        IntakeEnabled = _features.IntakeEnabled,
        RecognitionEnabled = _features.RecognitionEnabled,
        ReviewEnabled = _features.ReviewEnabled,
        ConfirmationEnabled = _features.ConfirmationEnabled,
        MaterializationEnabled = _features.MaterializationEnabled,
    };

    private async Task<AiOrderMigrationReadinessDto> CheckMigrationsAsync(
        CancellationToken cancellationToken)
    {
        var probe = _services.GetService<IAiOrderMigrationReadinessProbe>();
        if (probe is null)
            return new() { Status = "Blocked", RuntimeSchemaCurrent = false };
        var result = await probe.CheckAsync(cancellationToken);
        return new()
        {
            ExpectedMigrationIds = result.ExpectedMigrationIds,
            AppliedExpectedMigrationIds = result.AppliedExpectedMigrationIds,
            RuntimeSchemaCurrent = result.RuntimeSchemaCurrent,
            Status = result.Status,
        };
    }

    private DateTime PeriodStart(DateTime utcNow, bool monthly)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(_operations.BudgetTimeZoneId);
        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone);
        var localStart = monthly
            ? new DateTime(local.Year, local.Month, 1)
            : local.Date;
        return TimeZoneInfo.ConvertTimeToUtc(localStart, zone);
    }

    private static string Display(PrivateStorageReadinessStatus value) =>
        value switch
        {
            PrivateStorageReadinessStatus.PermissionDenied => "Permission Denied",
            PrivateStorageReadinessStatus.UnsafeLocation => "Unsafe Location",
            PrivateStorageReadinessStatus.LowSpace => "Low Space",
            PrivateStorageReadinessStatus.WriteTestFailed => "Write Test Failed",
            PrivateStorageReadinessStatus.DeleteTestFailed => "Delete Test Failed",
            _ => value.ToString(),
        };
}
