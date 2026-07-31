using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.Auth;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;
using Volo.Abp.Uow;

namespace TeeNova.AiOrderImports.Recognition;

[Authorize(Roles = TeeNovaRoles.Admin)]
[RemoteService(false)]
public class AiOrderRecognitionAppService : ApplicationService
{
    private static readonly JsonSerializerOptions SnapshotJsonOptions =
        new(JsonSerializerDefaults.Web);

    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderProcessingAttempt, Guid> _attempts;
    private readonly IAiOrderRecognitionModelRegistry _models;
    private readonly IAiOrderRecognitionCostEstimator _costs;
    private readonly AiOrderRecognitionSourcePreparer _sources;
    private readonly AiOrderRecognitionOptions _options;
    private readonly IGuidGenerator _guidGenerator;
    private readonly TimeProvider _timeProvider;

    public AiOrderRecognitionAppService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderProcessingAttempt, Guid> attempts,
        IAiOrderRecognitionModelRegistry models,
        IAiOrderRecognitionCostEstimator costs,
        AiOrderRecognitionSourcePreparer sources,
        IOptions<AiOrderRecognitionOptions> options,
        IGuidGenerator guidGenerator,
        TimeProvider timeProvider)
    {
        _imports = imports;
        _attempts = attempts;
        _models = models;
        _costs = costs;
        _sources = sources;
        _options = options.Value;
        _guidGenerator = guidGenerator;
        _timeProvider = timeProvider;
    }

    public virtual Task<AiOrderRecognitionOptionsDto> GetOptionsAsync()
    {
        var providers = _models.GetEnabledOptions();
        return Task.FromResult(new AiOrderRecognitionOptionsDto
        {
            RecognitionEnabled = providers.Count > 0,
            Providers = providers.Select(provider => new AiOrderRecognitionProviderOptionDto
            {
                Id = provider.Id,
                DisplayName = provider.DisplayName,
                Models = provider.Models.Select(model => new AiOrderRecognitionModelOptionDto
                {
                    Id = model.Id,
                    DisplayName = model.DisplayName,
                    SupportsImages = model.SupportsImages,
                    SupportsPdf = model.SupportsPdf,
                }).ToArray(),
            }).ToArray(),
        });
    }

    [UnitOfWork]
    public virtual Task<AiOrderRecognitionStatusDto> StartAsync(
        Guid importId,
        string operationKey,
        StartAiOrderRecognitionInput input,
        CancellationToken cancellationToken = default) =>
        QueueAsync(importId, operationKey, input, isRetry: false, cancellationToken);

    [UnitOfWork]
    public virtual Task<AiOrderRecognitionStatusDto> RetryAsync(
        Guid importId,
        string operationKey,
        StartAiOrderRecognitionInput input,
        CancellationToken cancellationToken = default) =>
        QueueAsync(importId, operationKey, input, isRetry: true, cancellationToken);

    private async Task<AiOrderRecognitionStatusDto> QueueAsync(
        Guid importId,
        string operationKey,
        StartAiOrderRecognitionInput input,
        bool isRetry,
        CancellationToken cancellationToken)
    {
        var normalizedKey = operationKey?.Trim() ?? string.Empty;
        if (normalizedKey.Length is < 1 or > 128)
            throw Safe(
                AiOrderImportErrorCodes.IdempotencyKeyRequired,
                "A Recognition-Idempotency-Key header is required.");

        var selection = _models.ResolveEnabled(
            input.Provider?.Trim() ?? string.Empty,
            input.Model?.Trim() ?? string.Empty);
        var sourceSnapshot = await _sources.DescribeAsync(
            importId,
            selection,
            cancellationToken);
        var requestHash = HashStartRequest(importId, selection, sourceSnapshot);
        var attemptQuery = await _attempts.GetQueryableAsync();
        var existing = await attemptQuery.SingleOrDefaultAsync(
            x => x.ImportId == importId && x.StartOperationKey == normalizedKey,
            cancellationToken);
        if (existing is not null)
        {
            if (!string.Equals(existing.StartRequestHash, requestHash, StringComparison.Ordinal))
                throw Safe(
                    AiOrderImportErrorCodes.RecognitionStartConflict,
                    "That recognition key was already used for different inputs.");
            return ToDto(existing);
        }

        var import = await _imports.GetAsync(importId, includeDetails: false, cancellationToken);
        if ((!isRetry && import.Status != AiOrderImportStatus.Uploaded) ||
            (isRetry && import.Status != AiOrderImportStatus.Failed))
            throw Safe(
                AiOrderImportErrorCodes.RecognitionStartNotAllowed,
                isRetry
                    ? "Recognition can be retried only after a failed attempt."
                    : "Recognition can start only from an uploaded import.");

        var attemptCount = await attemptQuery.CountAsync(
            x => x.ImportId == importId,
            cancellationToken);
        if (attemptCount >= _options.MaximumAttemptsPerImport)
            throw Safe(
                AiOrderImportErrorCodes.RecognitionAttemptLimitExceeded,
                "The recognition attempt limit has been reached.");

        var estimate = _costs.Estimate(selection, sourceSnapshot);
        if (estimate.EstimatedCostUsd > _options.MaximumEstimatedCostUsdPerAttempt)
            throw Safe(
                AiOrderImportErrorCodes.RecognitionAttemptBudgetExceeded,
                "The estimated recognition cost exceeds the configured per-attempt budget.");

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        if (isRetry && import.NextRetryAt.HasValue && import.NextRetryAt.Value > now)
            throw Safe(
                AiOrderImportErrorCodes.RecognitionRetryNotReady,
                "Recognition retry is not available until the provider retry delay has elapsed.");
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEstimate = await attemptQuery
            .Where(x => x.SubmittedAt >= monthStart && x.EstimatedCostUsd != null)
            .SumAsync(x => x.EstimatedCostUsd ?? 0, cancellationToken);
        if (monthEstimate + estimate.EstimatedCostUsd >
            _options.MaximumEstimatedCostUsdPerMonth)
            throw Safe(
                AiOrderImportErrorCodes.RecognitionMonthlyBudgetExceeded,
                "The configured monthly recognition budget would be exceeded.");

        var leaseToken = _guidGenerator.Create().ToString("N");
        import.ClaimProcessingLease(
            leaseToken,
            now.AddMinutes(_options.LeaseMinutes),
            now);
        var attempt = new AiOrderProcessingAttempt(
            _guidGenerator.Create(),
            importId,
            attemptCount + 1,
            leaseToken,
            selection.ProviderId,
            selection.ModelId,
            now);
        attempt.ConfigureRecognition(
            selection.ApiMode,
            selection.ApiVersion,
            AiOrderRecognitionVersions.Prompt,
            AiOrderRecognitionVersions.Contract,
            selection.StructuredOutputMode,
            selection.PricingVersion,
            JsonSerializer.Serialize(new
            {
                selection.PricingVersion,
                selection.InputUsdPerMillionTokens,
                selection.CachedInputUsdPerMillionTokens,
                selection.OutputUsdPerMillionTokens,
            }, SnapshotJsonOptions),
            JsonSerializer.Serialize(sourceSnapshot, SnapshotJsonOptions),
            normalizedKey,
            requestHash,
            estimate.EstimatedCostUsd);

        await _attempts.InsertAsync(attempt, autoSave: false, cancellationToken);
        await _imports.UpdateAsync(import, autoSave: true, cancellationToken);
        return ToDto(attempt);
    }

    internal static AiOrderRecognitionStatusDto ToDto(AiOrderProcessingAttempt attempt) =>
        new()
        {
            AttemptId = attempt.Id,
            AttemptNumber = attempt.AttemptNumber,
            Provider = attempt.Provider ?? string.Empty,
            Model = attempt.Model ?? string.Empty,
            Outcome = attempt.Outcome,
            SubmittedAt = attempt.SubmittedAt,
            CompletedAt = attempt.CompletedAt,
            SafeErrorCode = attempt.SafeErrorCode,
            IsRetryable = attempt.IsRetryable,
            NextRetryAt = attempt.NextRetryAt,
            InputTokens = attempt.InputTokenCount,
            OutputTokens = attempt.OutputTokenCount,
            EstimatedCostUsd = attempt.EstimatedCostUsd,
            ActualCostUsd = attempt.ActualCostUsd,
        };

    private static string HashStartRequest(
        Guid importId,
        AiOrderRecognitionModelSelection selection,
        IReadOnlyCollection<AiOrderRecognitionSourceDescriptor> sources)
    {
        var builder = new StringBuilder()
            .Append("ai-order-recognition-start:v1\n")
            .Append("import:").Append(importId.ToString("N")).Append('\n')
            .Append("provider:").Append(selection.ProviderId).Append('\n')
            .Append("model:").Append(selection.ModelId).Append('\n')
            .Append("prompt:").Append(AiOrderRecognitionVersions.Prompt).Append('\n')
            .Append("contract:").Append(AiOrderRecognitionVersions.Contract).Append('\n');
        foreach (var source in sources.OrderBy(x => x.Sequence))
        {
            builder.Append("source:")
                .Append(source.Id.ToString("N")).Append(':')
                .Append(source.Sequence).Append(':')
                .Append(source.ContentType).Append(':')
                .Append(source.ByteSize).Append(':')
                .Append(source.Sha256).Append(':')
                .Append(source.RotationDegrees).Append(':')
                .Append(source.PageCount?.ToString() ?? "null").Append('\n');
        }
        return Convert
            .ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())))
            .ToLowerInvariant();
    }

    private static BusinessException Safe(string code, string message) =>
        new(code, message);
}
