using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.Auth;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Data;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.AiOrderImports.Validation;

[Authorize(Roles = TeeNovaRoles.Admin)]
[RemoteService(false)]
public class AiOrderReviewAppService : ApplicationService
{
    private const int CatalogueSearchLimit = 20;
    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderImportRevision, Guid> _revisions;
    private readonly AiOrderExtractionValidationProcessor _processor;
    private readonly AiOrderImportFoundationService _foundation;
    private readonly AiOrderStaffReviewEngine _staffReview;

    public AiOrderReviewAppService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderImportRevision, Guid> revisions,
        AiOrderExtractionValidationProcessor processor,
        AiOrderImportFoundationService foundation,
        AiOrderStaffReviewEngine staffReview)
    {
        _imports = imports;
        _revisions = revisions;
        _processor = processor;
        _foundation = foundation;
        _staffReview = staffReview;
    }

    public virtual async Task<AiOrderReviewDto> GetAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        var import = await GetImportAsync(importId, cancellationToken);
        var revisions = await GetRevisionsAsync(importId, cancellationToken);
        var validation = LatestValidation(revisions);
        var staff = revisions
            .Where(x =>
                x.Source == AiOrderRevisionSource.Staff &&
                x.ValidationVersion == AiOrderStaffReviewVersions.Review)
            .OrderByDescending(x => x.Revision)
            .FirstOrDefault();
        var review = staff is null
            ? _staffReview.BuildInitialDocument(
                import.Id,
                import.CurrentRevision,
                validation.Revision,
                validation.Id,
                validation.CanonicalSha256,
                ParseObject(validation.CanonicalJson))
            : ParseObject(staff.CanonicalJson);
        return await MapAsync(
            import,
            validation,
            staff,
            review,
            revisions,
            cancellationToken);
    }

    public virtual async Task<AiOrderReviewDto> SaveAsync(
        Guid importId,
        SaveAiOrderReviewInput input,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        var import = await GetImportAsync(importId, cancellationToken);
        EnsureReviewState(import);
        if (input.ExpectedRevision != import.CurrentRevision)
            throw RevisionConflict(import);

        var revisions = await GetRevisionsAsync(importId, cancellationToken);
        var validation = LatestValidation(revisions);
        var currentStaff = revisions
            .Where(x =>
                x.Source == AiOrderRevisionSource.Staff &&
                x.ValidationVersion == AiOrderStaffReviewVersions.Review)
            .OrderByDescending(x => x.Revision)
            .FirstOrDefault();
        var previous = currentStaff is null
            ? _staffReview.BuildInitialDocument(
                importId,
                import.CurrentRevision,
                validation.Revision,
                validation.Id,
                validation.CanonicalSha256,
                ParseObject(validation.CanonicalJson))
            : ParseObject(currentStaff.CanonicalJson);
        var catalogue = await _processor.LoadCatalogueAsync(cancellationToken);
        var actorId = RequireAdminId();
        var recordedAt = Clock.Now.ToUniversalTime();
        var built = _staffReview.BuildReviewedDocument(
            importId,
            import.CurrentRevision,
            validation.Revision,
            validation.Id,
            validation.CanonicalSha256,
            previous,
            input,
            catalogue,
            actorId,
            recordedAt);

        AiOrderImportRevision saved;
        try
        {
            saved = await _foundation.AppendReviewedRevisionAsync(
                importId,
                input.ExpectedRevision,
                AiOrderStaffReviewVersions.Review,
                built.CanonicalJson,
                built.CanonicalSha256,
                actorId,
                built.Events,
                markDraft: true,
                cancellationToken);
        }
        catch (BusinessException exception)
            when (exception.Code == "TeeNova:AiOrderImport:RevisionConflict")
        {
            throw await FreshRevisionConflictAsync(importId, cancellationToken);
        }
        catch (AbpDbConcurrencyException)
        {
            throw await FreshRevisionConflictAsync(importId, cancellationToken);
        }
        catch (DbUpdateException exception)
            when (IsRevisionUniquenessConflict(exception))
        {
            throw await FreshRevisionConflictAsync(importId, cancellationToken);
        }

        import = await GetImportAsync(importId, cancellationToken);
        return await MapAsync(
            import,
            validation,
            saved,
            built.Document,
            revisions.Append(saved).ToArray(),
            cancellationToken);
    }

    public virtual async Task<AiOrderCatalogueSearchResultDto> SearchCatalogueAsync(
        Guid importId,
        string? query,
        CancellationToken cancellationToken = default)
    {
        var import = await GetImportAsync(importId, cancellationToken);
        EnsureReviewState(import);
        var term = query?.Trim();
        if (string.IsNullOrWhiteSpace(term) || term.Length < 2 || term.Length > 100)
            throw new BusinessException(
                AiOrderImportErrorCodes.ReviewDocumentInvalid,
                "Catalogue search requires 2 to 100 characters.");
        var normalized = AiOrderTextNormalization.NormalizeComparison(term)!;
        var code = AiOrderTextNormalization.NormalizeProductCode(term);
        var catalogue = await _processor.LoadCatalogueAsync(cancellationToken);
        var items = catalogue
            .Select(product =>
            {
                var exactName =
                    AiOrderTextNormalization.NormalizeComparison(product.Name) == normalized;
                var exactSku = product.Variants.Any(
                    variant =>
                        AiOrderTextNormalization.NormalizeProductCode(variant.Sku) == code);
                var contains = AiOrderTextNormalization.NormalizeComparison(product.Name)?
                    .Contains(normalized, StringComparison.Ordinal) == true;
                return new
                {
                    Product = product,
                    Rank = exactSku ? 0 : exactName ? 1 : contains ? 2 : 99,
                };
            })
            .Where(x => x.Rank < 99)
            .OrderBy(x => x.Product.IsActive ? 0 : 1)
            .ThenBy(x => x.Rank)
            .ThenBy(x => x.Product.Name, StringComparer.Ordinal)
            .Take(CatalogueSearchLimit)
            .Select(x => new AiOrderCatalogueSearchItemDto
            {
                ProductId = x.Product.Id,
                ProductName = x.Product.Name,
                ProductKind = x.Product.Kind.ToString(),
                PricingModel = x.Product.PricingModel.ToString(),
                IsActive = x.Product.IsActive,
                MatchKind = x.Rank switch
                {
                    0 => "ExactVariantSku",
                    1 => "ExactProductName",
                    _ => "ProductNameContains",
                },
                Variants = x.Product.Variants
                    .OrderBy(v => v.Colour, StringComparer.Ordinal)
                    .ThenBy(v => v.Size, StringComparer.Ordinal)
                    .ThenBy(v => v.Sku, StringComparer.Ordinal)
                    .Take(100)
                    .Select(v => new AiOrderCatalogueVariantDto
                    {
                        ProductVariantId = v.Id,
                        Sku = v.Sku,
                        Colour = v.Colour,
                        Size = v.Size,
                        IsAvailable = v.IsAvailable,
                    })
                    .ToArray(),
            })
            .ToArray();
        return new AiOrderCatalogueSearchResultDto
        {
            Items = items,
        };
    }

    public virtual async Task<AiOrderReviewDto> RevalidateAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        var import = await GetImportAsync(importId, cancellationToken);
        if (import.Status == AiOrderImportStatus.NeedsReview)
            await _processor.ValidateLatestAiRevisionAsync(importId, cancellationToken);
        else if (import.Status != AiOrderImportStatus.Draft)
            throw new BusinessException(AiOrderImportErrorCodes.ValidationNotAllowed);
        // Every Staff save revalidates the complete Draft. A Draft GET still reports
        // stale catalogue evidence without appending a concurrency-unsafe revision.
        return await GetAsync(importId, cancellationToken);
    }

    private async Task<AiOrderReviewDto> MapAsync(
        AiOrderImport import,
        AiOrderImportRevision validation,
        AiOrderImportRevision? staff,
        JsonObject root,
        IReadOnlyCollection<AiOrderImportRevision> revisions,
        CancellationToken cancellationToken)
    {
        var catalogue = await _processor.LoadCatalogueAsync(cancellationToken);
        var currentFingerprint =
            AiOrderExtractionNormalizer.CreateCatalogueFingerprint(catalogue);
        var recordedFingerprint = root["catalogueFingerprint"]?.GetValue<string>();
        var stale = !string.Equals(
            currentFingerprint,
            recordedFingerprint,
            StringComparison.Ordinal);
        var readiness = root["confirmationReadiness"]?.DeepClone() as JsonObject ??
                        new JsonObject();
        if (stale)
        {
            readiness["readyToConfirm"] = false;
            readiness["catalogueSelectionsCurrent"] = false;
            readiness["confirmOrderEnabled"] = false;
            readiness["message"] =
                "Catalogue data changed. Save the Draft again to revalidate selections.";
        }

        var validationRoot = ParseObject(validation.CanonicalJson);
        var sourceRevision = validationRoot["sourceAiRevision"]?["revision"]?.GetValue<int>() ?? 0;
        var sourceAi = revisions.SingleOrDefault(
            x => x.Revision == sourceRevision &&
                 x.Source == AiOrderRevisionSource.AI);
        var catalogueValidatedAt = ParseDate(
            root["catalogueValidatedAt"]?.GetValue<string>() ??
            validationRoot["catalogueValidatedAt"]?.GetValue<string>());
        var issues = root["issues"] as JsonArray ?? [];
        var blocking = issues.OfType<JsonObject>().Count(x =>
            x["severity"]?.GetValue<string>() == "Blocking" &&
            x["resolution"]?["status"]?.GetValue<string>() == "Open");
        var warnings = issues.OfType<JsonObject>().Count(x =>
            x["severity"]?.GetValue<string>() == "Warning" &&
            x["resolution"]?["status"]?.GetValue<string>() == "Open");

        return new AiOrderReviewDto
        {
            ImportId = import.Id,
            Status = import.Status,
            CurrentRevision = import.CurrentRevision,
            BaseRevision = root["baseRevision"]?.GetValue<int>() ?? import.CurrentRevision,
            ReviewVersion = AiOrderStaffReviewVersions.Review,
            HasStaffRevision = staff is not null,
            ValidationRevision = validation.Revision,
            ValidationRevisionId = validation.Id,
            ValidationVersion = validation.ValidationVersion,
            SourceAiRevision = sourceRevision,
            CanonicalSha256 = staff?.CanonicalSha256 ?? validation.CanonicalSha256,
            CatalogueValidationStatus = stale ? "Stale" : "Current",
            CatalogueValidatedAt = catalogueValidatedAt,
            RequiresRevalidation = stale,
            IssueCount = issues.Count,
            BlockingIssueCount = blocking,
            WarningCount = warnings,
            Customer = Element(root["customer"]),
            ProductGroups = Element(root["productGroups"]),
            Financials = Element(root["financials"]),
            Issues = Element(issues),
            IssueResolutions = Element(root["issueResolutions"] ?? new JsonArray()),
            ConfirmationReadiness = Element(readiness),
            LastSavedAt = staff?.RecordedAt,
            Processing = sourceAi?.Provider is null ||
                         sourceAi.Model is null ||
                         sourceAi.PromptVersion is null
                ? null
                : new AiOrderReviewProviderSummaryDto
                {
                    Provider = sourceAi.Provider,
                    Model = sourceAi.Model,
                    PromptVersion = sourceAi.PromptVersion,
                },
        };
    }

    private async Task<AiOrderImport> GetImportAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        var query = await _imports.GetQueryableAsync();
        return await query.AsNoTracking().SingleOrDefaultAsync(
                   x => x.Id == importId,
                   cancellationToken)
               ?? throw new BusinessException(AiOrderImportErrorCodes.ImportNotFound);
    }

    private async Task<IReadOnlyList<AiOrderImportRevision>> GetRevisionsAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        var query = await _revisions.GetQueryableAsync();
        return await query
            .AsNoTracking()
            .Where(x => x.ImportId == importId)
            .OrderBy(x => x.Revision)
            .ToListAsync(cancellationToken);
    }

    private static AiOrderImportRevision LatestValidation(
        IEnumerable<AiOrderImportRevision> revisions) =>
        revisions
            .Where(x =>
                x.Source == AiOrderRevisionSource.Validation &&
                x.ValidationVersion == AiOrderValidationVersions.Validation)
            .OrderByDescending(x => x.Revision)
            .FirstOrDefault()
        ?? throw new BusinessException(AiOrderImportErrorCodes.ValidationNotAvailable);

    private static bool IsRevisionUniquenessConflict(DbUpdateException exception)
    {
        var message = exception.InnerException?.Message ?? exception.Message;
        return message.Contains(
                   "UX_AiOrderImportRevisions_Import_Revision",
                   StringComparison.OrdinalIgnoreCase) ||
               message.Contains(
                   "IX_AiOrderImportRevisions_ImportId_Revision",
                   StringComparison.OrdinalIgnoreCase) ||
               (
                   message.Contains(
                       "AiOrderImportRevisions",
                       StringComparison.OrdinalIgnoreCase) &&
                   message.Contains("ImportId", StringComparison.OrdinalIgnoreCase) &&
                   message.Contains("Revision", StringComparison.OrdinalIgnoreCase)
               );
    }

    private static void EnsureReviewState(AiOrderImport import)
    {
        if (import.Status is not (
                AiOrderImportStatus.NeedsReview or
                AiOrderImportStatus.Draft))
            throw new BusinessException(
                AiOrderImportErrorCodes.ReviewNotAllowed,
                "Staff review is available only for NeedsReview or Draft imports.");
    }

    private Guid RequireAdminId() =>
        CurrentUser.Id ??
        throw new BusinessException(
            AiOrderImportErrorCodes.InvalidRequest,
            "The authenticated Admin identity is unavailable.");

    private static BusinessException RevisionConflict(AiOrderImport import) =>
        new BusinessException(
            AiOrderImportErrorCodes.ReviewRevisionConflict,
            "This Draft changed in another tab. Reload the latest revision before saving.")
            .WithData("CurrentRevision", import.CurrentRevision)
            .WithData("Status", import.Status.ToString());

    private async Task<BusinessException> FreshRevisionConflictAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        var current = await GetImportAsync(importId, cancellationToken);
        return RevisionConflict(current);
    }

    private static JsonObject ParseObject(string json) =>
        JsonNode.Parse(json) as JsonObject ??
        throw new BusinessException(AiOrderImportErrorCodes.ValidationNotAvailable);

    private static JsonElement Element(JsonNode? node)
    {
        using var document = JsonDocument.Parse(
            (node ?? new JsonObject()).ToJsonString());
        return document.RootElement.Clone();
    }

    private static DateTime ParseDate(string? value) =>
        DateTime.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind,
            out var parsed)
            ? parsed
            : DateTime.UnixEpoch;
}
