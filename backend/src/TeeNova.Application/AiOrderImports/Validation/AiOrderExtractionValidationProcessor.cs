using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Catalog;
using Volo.Abp;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;

namespace TeeNova.AiOrderImports.Validation;

public sealed class AiOrderExtractionValidationProcessor : ITransientDependency
{
    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderImportRevision, Guid> _revisions;
    private readonly IRepository<Product, Guid> _products;
    private readonly AiOrderImportFoundationService _foundation;
    private readonly IAiOrderExtractionNormalizer _normalizer;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<AiOrderExtractionValidationProcessor> _logger;
    private readonly IUnitOfWorkManager _unitOfWorkManager;

    public AiOrderExtractionValidationProcessor(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderImportRevision, Guid> revisions,
        IRepository<Product, Guid> products,
        AiOrderImportFoundationService foundation,
        IAiOrderExtractionNormalizer normalizer,
        TimeProvider timeProvider,
        ILogger<AiOrderExtractionValidationProcessor> logger,
        IUnitOfWorkManager unitOfWorkManager)
    {
        _imports = imports;
        _revisions = revisions;
        _products = products;
        _foundation = foundation;
        _normalizer = normalizer;
        _timeProvider = timeProvider;
        _logger = logger;
        _unitOfWorkManager = unitOfWorkManager;
    }

    public async Task<AiOrderImportRevision?> ValidateLatestAiRevisionAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        AiOrderImport import;
        AiOrderImportRevision aiRevision;
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue;
        List<AiOrderImportRevision> validationRevisions;
        using (var unitOfWork = _unitOfWorkManager.Begin(
                   requiresNew: true,
                   isTransactional: false))
        {
            var importQuery = await _imports.GetQueryableAsync();
            import = await importQuery
                .AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == importId, cancellationToken)
                ?? throw new BusinessException(AiOrderImportErrorCodes.ImportNotFound);
            if (import.Status != AiOrderImportStatus.NeedsReview)
                throw new BusinessException(AiOrderImportErrorCodes.ValidationNotAllowed);

            var revisionQuery = await _revisions.GetQueryableAsync();
            aiRevision = await revisionQuery
                .AsNoTracking()
                .Where(x => x.ImportId == importId &&
                            x.Source == AiOrderRevisionSource.AI &&
                            x.ContractVersion == "1.0")
                .OrderByDescending(x => x.Revision)
                .FirstOrDefaultAsync(cancellationToken)
                ?? throw new BusinessException(AiOrderImportErrorCodes.ValidationNotAvailable);
            validationRevisions = await revisionQuery
                .AsNoTracking()
                .Where(x => x.ImportId == importId &&
                            x.Source == AiOrderRevisionSource.Validation &&
                            x.ValidationVersion == AiOrderValidationVersions.Validation)
                .OrderByDescending(x => x.Revision)
                .ToListAsync(cancellationToken);
            catalogue = await LoadCatalogueCoreAsync(cancellationToken);
            await unitOfWork.CompleteAsync(cancellationToken);
        }
        var result = _normalizer.NormalizeAndValidate(
            importId,
            aiRevision.Revision,
            aiRevision.Id,
            aiRevision.CanonicalSha256,
            aiRevision.CanonicalJson,
            catalogue,
            _timeProvider.GetUtcNow().UtcDateTime);

        var equivalent = validationRevisions.FirstOrDefault(
            revision => HasInputHash(revision.CanonicalJson, result.ValidationInputHash));
        if (equivalent is not null)
            return equivalent;

        return await _foundation.AppendRevisionAsync(
            importId,
            import.CurrentRevision,
            AiOrderValidationVersions.Validation,
            result.CanonicalJson,
            result.CanonicalSha256,
            AiOrderRevisionSource.Validation,
            import.CreatedByAdminId,
            markDraft: false,
            cancellationToken);
    }

    public async Task TryValidateAfterRecognitionAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await ValidateLatestAiRevisionAsync(importId, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                "AI order validation failed safely for import {ImportId}; code {SafeCode}.",
                importId,
                exception is BusinessException business
                    ? business.Code ?? "ValidationFailed"
                    : "ValidationFailed");
            await RecordFailureBestEffortAsync(importId, cancellationToken);
        }
    }

    public async Task<IReadOnlyList<AiOrderCatalogueProductSnapshot>> LoadCatalogueAsync(
        CancellationToken cancellationToken = default)
    {
        using var unitOfWork = _unitOfWorkManager.Begin(
            requiresNew: true,
            isTransactional: false);
        var catalogue = await LoadCatalogueCoreAsync(cancellationToken);
        await unitOfWork.CompleteAsync(cancellationToken);
        return catalogue;
    }

    private async Task<IReadOnlyList<AiOrderCatalogueProductSnapshot>> LoadCatalogueCoreAsync(
        CancellationToken cancellationToken)
    {
        var query = await _products.WithDetailsAsync(x => x.Variants);
        var products = await query
            .AsNoTracking()
            .OrderBy(x => x.Id)
            .ToListAsync(cancellationToken);
        return products.Select(product => new AiOrderCatalogueProductSnapshot(
                product.Id,
                product.Name,
                product.Kind,
                product.PricingModel,
                product.IsActive,
                product.Variants
                    .OrderBy(x => x.Id)
                    .Select(variant => new AiOrderCatalogueVariantSnapshot(
                        variant.Id,
                        variant.Sku,
                        variant.Color,
                        variant.Size,
                        variant.IsAvailable))
                    .ToArray()))
            .ToArray();
    }

    private async Task RecordFailureBestEffortAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        try
        {
            AiOrderImport? import;
            using (var unitOfWork = _unitOfWorkManager.Begin(
                       requiresNew: true,
                       isTransactional: false))
            {
                var query = await _imports.GetQueryableAsync();
                import = await query.AsNoTracking().SingleOrDefaultAsync(
                    x => x.Id == importId,
                    cancellationToken);
                await unitOfWork.CompleteAsync(cancellationToken);
            }
            if (import is null ||
                import.Status != AiOrderImportStatus.NeedsReview ||
                import.CurrentRevision < 1)
                return;
            await _foundation.AppendReviewEventAsync(
                importId,
                import.CurrentRevision,
                import.CurrentRevision,
                AiOrderReviewAction.ValidationFailed,
                null,
                null,
                null,
                "AI_ORDER_VALIDATION_FAILED",
                import.CreatedByAdminId,
                cancellationToken);
        }
        catch
        {
            _logger.LogWarning(
                "AI order validation failure evidence could not be persisted for import {ImportId}.",
                importId);
        }
    }

    private static bool HasInputHash(string json, string expectedHash)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty(
                       "validationInputHash",
                       out var value) &&
                   string.Equals(
                       value.GetString(),
                       expectedHash,
                       StringComparison.Ordinal);
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
