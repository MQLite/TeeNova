using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.Validation;
using TeeNova.Auth;
using Xunit;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderValidationSecurityContractTests
{
    [Fact]
    public void Review_service_and_controller_require_admin_role()
    {
        Assert.Equal(
            TeeNovaRoles.Admin,
            typeof(AiOrderReviewAppService)
                .GetCustomAttribute<AuthorizeAttribute>()!
                .Roles);
        Assert.Equal(
            TeeNovaRoles.Admin,
            typeof(AiOrderImportsController)
                .GetCustomAttribute<AuthorizeAttribute>()!
                .Roles);
    }

    [Fact]
    public void Review_get_route_is_identifier_only_and_read_only()
    {
        var method = typeof(AiOrderImportsController).GetMethod("GetReviewAsync")!;
        var route = method.GetCustomAttribute<HttpGetAttribute>();

        Assert.NotNull(route);
        Assert.Equal("{id:guid}/review", route!.Template);
        Assert.Null(method.GetCustomAttribute<HttpPostAttribute>());
        Assert.Equal(
            [typeof(Guid), typeof(CancellationToken)],
            method.GetParameters().Select(x => x.ParameterType).ToArray());
    }

    [Fact]
    public void Revalidation_is_explicit_admin_post()
    {
        var method = typeof(AiOrderImportsController).GetMethod("RevalidateAsync")!;

        Assert.Equal(
            "{id:guid}/review/revalidate",
            method.GetCustomAttribute<HttpPostAttribute>()!.Template);
    }

    [Fact]
    public void Review_dto_exposes_no_raw_provider_or_private_storage_members()
    {
        var names = typeof(AiOrderReviewDto)
            .GetProperties()
            .Select(x => x.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var forbidden = new[]
        {
            "RawProviderResponse",
            "RawResult",
            "RenderedPrompt",
            "PrivateObjectKey",
            "PhysicalPath",
            "ProviderCredential",
            "ApiKey",
        };

        Assert.Empty(forbidden.Intersect(names, StringComparer.OrdinalIgnoreCase));
    }

    [Fact]
    public void Validation_pipeline_has_no_forbidden_write_service_dependency()
    {
        var constructorTypes = new[]
            {
                typeof(AiOrderExtractionValidationProcessor),
                typeof(AiOrderExtractionNormalizer),
                typeof(AiOrderCatalogueMatcher),
                typeof(AiOrderFinancialValidator),
            }
            .SelectMany(type => type.GetConstructors())
            .SelectMany(constructor => constructor.GetParameters())
            .Select(parameter => parameter.ParameterType.FullName ?? parameter.ParameterType.Name)
            .ToArray();
        var forbidden = new[]
        {
            "OrderAppService",
            "Payment",
            "Email",
            "Inventory",
            "Production",
            "Pdf",
            "CatalogAppService",
        };

        Assert.DoesNotContain(
            constructorTypes,
            typeName => forbidden.Any(
                token => typeName.Contains(token, StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public void Validation_revision_advance_leaves_import_in_needs_review()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var import = new AiOrderImport(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "1.0",
            "key",
            new string('a', 64),
            "standard");
        import.ClaimProcessingLease("lease", now.AddMinutes(5), now);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease", now);

        import.AdvanceRevision(1, 2);

        Assert.Equal(AiOrderImportStatus.NeedsReview, import.Status);
        Assert.Equal(2, import.CurrentRevision);
    }

    [Fact]
    public void Candidate_bounds_are_fixed_and_small()
    {
        Assert.Equal(5, AiOrderValidationVersions.MaximumProductCandidates);
        Assert.Equal(5, AiOrderValidationVersions.MaximumVariantCandidates);
    }

    [Fact]
    public void Required_issue_code_contract_is_exact()
    {
        Assert.Equal("PRODUCT_MISSING", AiOrderValidationIssueCodes.ProductMissing);
        Assert.Equal("PRODUCT_UNRESOLVED", AiOrderValidationIssueCodes.ProductUnresolved);
        Assert.Equal("COLOUR_MISSING", AiOrderValidationIssueCodes.ColourMissing);
        Assert.Equal("SIZE_MISSING", AiOrderValidationIssueCodes.SizeMissing);
        Assert.Equal("QUANTITY_MISSING", AiOrderValidationIssueCodes.QuantityMissing);
        Assert.Equal("ORDER_TOTAL_MISSING", AiOrderValidationIssueCodes.OrderTotalMissing);
        Assert.Equal("DEPOSIT_PAID_MISSING", AiOrderValidationIssueCodes.DepositPaidMissing);
    }
}
