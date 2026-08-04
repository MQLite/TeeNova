using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using TeeNova.Catalog;

namespace TeeNova.AiOrderImports.Validation;

public static class AiOrderValidationVersions
{
    public const string Validation = "ai-order-validation-v1";
    public const string NormalizationRules = "ai-order-normalization-rules-v1";
    public const string ColourPolicy = "ai-order-colour-policy-v1";
    public const string SizePolicy = "ai-order-size-policy-v1";
    public const int MaximumProductCandidates = 5;
    public const int MaximumVariantCandidates = 5;
}

public static class AiOrderValidationIssueCodes
{
    public const string ProductMissing = "PRODUCT_MISSING";
    public const string ProductUnresolved = "PRODUCT_UNRESOLVED";
    public const string ColourMissing = "COLOUR_MISSING";
    public const string SizeMissing = "SIZE_MISSING";
    public const string QuantityMissing = "QUANTITY_MISSING";
    public const string OrderTotalMissing = "ORDER_TOTAL_MISSING";
    public const string DepositPaidMissing = "DEPOSIT_PAID_MISSING";
    public const string ProductMatchAmbiguous = "PRODUCT_MATCH_AMBIGUOUS";
    public const string ProductMatchConfirmationRequired =
        "PRODUCT_MATCH_CONFIRMATION_REQUIRED";
    public const string AdHocProductConfirmationRequired =
        "AD_HOC_PRODUCT_CONFIRMATION_REQUIRED";
    public const string AdHocProductCreated = "AD_HOC_PRODUCT_CREATED";
    public const string RowFallsBackToAdHoc = "ROW_FALLS_BACK_TO_AD_HOC";
    public const string ColourAmbiguous = "COLOUR_AMBIGUOUS";
    public const string ColourCustom = "COLOUR_CUSTOM";
    public const string ColourNotApplicableConfirmationRequired =
        "COLOUR_NOT_APPLICABLE_CONFIRMATION_REQUIRED";
    public const string SizeUncertain = "SIZE_UNCERTAIN";
    public const string CustomSizeConfirmationRequired =
        "CUSTOM_SIZE_CONFIRMATION_REQUIRED";
    public const string LowConfidenceRequiredField =
        "LOW_CONFIDENCE_REQUIRED_FIELD";
    public const string SupplySourceInferred = "SUPPLY_SOURCE_INFERRED";
    public const string CurrencyInferred = "CURRENCY_INFERRED";
    public const string QuantitySumMismatch = "QUANTITY_SUM_MISMATCH";
    public const string QuantityMultipleValues = "QUANTITY_MULTIPLE_VALUES";
    public const string DuplicateSizeRowUncertain =
        "DUPLICATE_SIZE_ROW_UNCERTAIN";
    public const string OrderTotalMultipleValues =
        "ORDER_TOTAL_MULTIPLE_VALUES";
    public const string DepositMultipleValues = "DEPOSIT_MULTIPLE_VALUES";
    public const string DepositExceedsTotal = "DEPOSIT_EXCEEDS_TOTAL";
    public const string FinancialBalanceMismatch =
        "FINANCIAL_BALANCE_MISMATCH";
    public const string ProductColourConflict = "PRODUCT_COLOUR_CONFLICT";
    public const string ProductSizeConflict = "PRODUCT_SIZE_CONFLICT";
    public const string CatalogueSelectionStale = "CATALOGUE_SELECTION_STALE";
    public const string VariantNotFound = "VARIANT_NOT_FOUND";
    public const string VariantAmbiguous = "VARIANT_AMBIGUOUS";
    public const string ColourNotAvailableForProduct =
        "COLOUR_NOT_AVAILABLE_FOR_PRODUCT";
    public const string SizeNotAvailableForProduct =
        "SIZE_NOT_AVAILABLE_FOR_PRODUCT";
    public const string CatalogueProductInactive =
        "CATALOGUE_PRODUCT_INACTIVE";
    public const string WrittenTotalDiffersFromCatalogueQuote =
        "WRITTEN_TOTAL_DIFFERS_FROM_CATALOGUE_QUOTE";
}

public sealed class AiOrderValidationOptions
{
    public const string SectionName = "AiOrderValidation";

    public decimal RequiredFieldConfidenceThreshold { get; set; } = 0.75m;

    // Contact details the source document does not carry are filled with these
    // placeholders so an import is never blocked on a detail Admin can fix later.
    public string FallbackCustomerName { get; set; } = "Internal";
    public string FallbackCustomerPhone { get; set; } = "Internal";
    public string FallbackCustomerEmail { get; set; } = "yituoxx@gmail.com";

    public Dictionary<string, string> ColourAliases { get; set; } =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["blk"] = "Black",
        };
    public Dictionary<string, string> SizeAliases { get; set; } =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["x-large"] = "XL",
            ["x large"] = "XL",
            ["xxl"] = "2XL",
            ["os"] = "One Size",
            ["one-size"] = "One Size",
        };
}

public sealed class AiOrderValidationOptionsValidator :
    IValidateOptions<AiOrderValidationOptions>
{
    public ValidateOptionsResult Validate(
        string? name,
        AiOrderValidationOptions options)
    {
        if (options.RequiredFieldConfidenceThreshold is < 0 or > 1)
            return ValidateOptionsResult.Fail(
                "AiOrderValidation:RequiredFieldConfidenceThreshold must be between 0 and 1.");
        if (string.IsNullOrWhiteSpace(options.FallbackCustomerName) ||
            string.IsNullOrWhiteSpace(options.FallbackCustomerPhone))
            return ValidateOptionsResult.Fail(
                "AiOrderValidation fallback customer name and phone must not be empty.");
        if (string.IsNullOrWhiteSpace(options.FallbackCustomerEmail) ||
            !options.FallbackCustomerEmail.Contains('@', StringComparison.Ordinal))
            return ValidateOptionsResult.Fail(
                "AiOrderValidation:FallbackCustomerEmail must be an email address.");
        if (options.ColourAliases.Any(x =>
                string.IsNullOrWhiteSpace(x.Key) ||
                string.IsNullOrWhiteSpace(x.Value)) ||
            options.SizeAliases.Any(x =>
                string.IsNullOrWhiteSpace(x.Key) ||
                string.IsNullOrWhiteSpace(x.Value)))
            return ValidateOptionsResult.Fail(
                "AI order validation aliases must have non-empty keys and values.");
        return ValidateOptionsResult.Success;
    }
}

public sealed record AiOrderCatalogueVariantSnapshot(
    Guid Id,
    string Sku,
    string Colour,
    string Size,
    bool IsAvailable);

public sealed record AiOrderCatalogueProductSnapshot(
    Guid Id,
    string Name,
    ProductKind Kind,
    PricingModel PricingModel,
    bool IsActive,
    IReadOnlyList<AiOrderCatalogueVariantSnapshot> Variants);

public sealed record AiOrderValidationBuildResult(
    JsonObject Document,
    string CanonicalJson,
    string CanonicalSha256,
    string ValidationInputHash,
    string CatalogueFingerprint,
    int IssueCount,
    int BlockingIssueCount,
    int WarningCount);

public interface IAiOrderExtractionNormalizer
{
    AiOrderValidationBuildResult NormalizeAndValidate(
        Guid importId,
        int sourceAiRevisionNumber,
        Guid sourceAiRevisionId,
        string sourceAiSha256,
        string aiCanonicalJson,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        DateTime catalogueValidatedAt);
}

public interface IAiOrderCatalogueMatcher
{
    IReadOnlyList<JsonObject> MatchProducts(
        string? writtenName,
        string? writtenCode,
        string? colour,
        IReadOnlyCollection<string> sizes,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue);

    IReadOnlyList<JsonObject> MatchVariants(
        AiOrderCatalogueProductSnapshot product,
        string? writtenSku,
        string? colour,
        string? size);
}

public interface IAiOrderGroupingNormalizer
{
    string CreateTypedGroupKey(JsonObject normalizedFragment);
}

public interface IAiOrderFinancialValidator
{
    JsonObject Normalize(
        JsonObject sourceFinancials,
        IList<JsonObject> issues,
        decimal confidenceThreshold);
}
