using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using TeeNova.Orders;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Validation;

public static partial class AiOrderTextNormalization
{
    public static string? NormalizeText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        var normalized = value.Normalize(NormalizationForm.FormKC);
        normalized = SmartPunctuationRegex().Replace(normalized, match => match.Value switch
        {
            "\u2018" or "\u2019" => "'",
            "\u201c" or "\u201d" => "\"",
            "\u2013" or "\u2014" => "-",
            _ => match.Value,
        });
        return RepeatedWhitespaceRegex().Replace(normalized.Trim(), " ");
    }

    public static string? NormalizeComparison(string? value)
    {
        var normalized = NormalizeText(value);
        if (normalized is null)
            return null;
        normalized = CommonPunctuationRegex().Replace(normalized, " ");
        return RepeatedWhitespaceRegex()
            .Replace(normalized, " ")
            .Trim()
            .ToUpperInvariant();
    }

    public static string? NormalizeProductCode(string? value)
    {
        var normalized = NormalizeText(value);
        if (normalized is null)
            return null;
        return ProductCodeSeparatorRegex()
            .Replace(normalized, string.Empty)
            .ToUpperInvariant();
    }

    public static string? NormalizePhone(string? value, out bool uncertain)
    {
        uncertain = false;
        var normalized = NormalizeText(value);
        if (normalized is null)
            return null;
        var leadingPlus = normalized.StartsWith('+');
        var digits = new string(normalized.Where(char.IsDigit).ToArray());
        if (digits.Length is < 7 or > 15)
        {
            uncertain = true;
            return normalized;
        }
        return leadingPlus ? $"+{digits}" : digits;
    }

    public static string? NormalizeEmail(string? value, out bool valid)
    {
        var normalized = NormalizeText(value)?.ToLowerInvariant();
        valid = normalized is null || EmailRegex().IsMatch(normalized);
        return normalized;
    }

    public static bool TryNormalizeMoney(
        string? value,
        out string? normalizedAmount,
        out string? error)
    {
        normalizedAmount = null;
        error = null;
        var normalized = NormalizeText(value);
        if (normalized is null)
            return false;
        normalized = normalized
            .Replace("$", string.Empty, StringComparison.Ordinal)
            .Replace(",", string.Empty, StringComparison.Ordinal)
            .Replace("NZD", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Trim();
        if (!decimal.TryParse(
                normalized,
                NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
                CultureInfo.InvariantCulture,
                out var amount))
        {
            error = "invalid";
            return false;
        }
        if (amount < 0)
        {
            error = "negative";
            return false;
        }
        if (decimal.Round(amount, 2, MidpointRounding.ToEven) != amount)
        {
            error = "fractional-cent";
            return false;
        }
        normalizedAmount = amount.ToString("0.00", CultureInfo.InvariantCulture);
        return true;
    }

    public static bool TryNormalizeQuantity(
        JsonNode? value,
        out int? quantity,
        out string? error)
    {
        quantity = null;
        error = null;
        if (value is null)
            return false;
        if (value is JsonValue jsonValue && jsonValue.TryGetValue<int>(out var integer))
        {
            quantity = integer;
        }
        else
        {
            var text = value.ToString();
            if (!decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ||
                decimal.Truncate(number) != number ||
                number < int.MinValue ||
                number > int.MaxValue)
            {
                error = "fractional-or-invalid";
                return false;
            }
            quantity = (int)number;
        }

        if (quantity <= 0)
            error = "not-positive";
        else if (quantity > OrderLimits.MaxOrderItemQuantity)
            error = "above-maximum";
        return error is null;
    }

    public static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)))
            .ToLowerInvariant();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex RepeatedWhitespaceRegex();

    [GeneratedRegex(@"[\u2018\u2019\u201c\u201d\u2013\u2014]", RegexOptions.CultureInvariant)]
    private static partial Regex SmartPunctuationRegex();

    [GeneratedRegex(@"[\p{P}\p{S}]+", RegexOptions.CultureInvariant)]
    private static partial Regex CommonPunctuationRegex();

    [GeneratedRegex(@"[\s\-_./]+", RegexOptions.CultureInvariant)]
    private static partial Regex ProductCodeSeparatorRegex();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.CultureInvariant)]
    private static partial Regex EmailRegex();
}

public sealed class AiOrderCatalogueMatcher :
    IAiOrderCatalogueMatcher,
    ITransientDependency
{
    public IReadOnlyList<JsonObject> MatchProducts(
        string? writtenName,
        string? writtenCode,
        string? colour,
        IReadOnlyCollection<string> sizes,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue)
    {
        var nameKey = AiOrderTextNormalization.NormalizeComparison(writtenName);
        var codeKey = AiOrderTextNormalization.NormalizeProductCode(writtenCode);
        var colourKey = AiOrderTextNormalization.NormalizeComparison(colour);
        var sizeKeys = sizes
            .Select(AiOrderTextNormalization.NormalizeComparison)
            .Where(x => x is not null)
            .Cast<string>()
            .ToHashSet(StringComparer.Ordinal);

        var matches = new List<(AiOrderCatalogueProductSnapshot Product, decimal Score, string Match, List<string> Reasons, List<string> Warnings)>();
        foreach (var product in catalogue)
        {
            var reasons = new List<string>();
            var warnings = new List<string>();
            var score = 0m;
            var match = "Candidate";

            if (codeKey is not null && product.Variants.Any(
                    variant => AiOrderTextNormalization.NormalizeProductCode(variant.Sku) == codeKey))
            {
                score = 1.00m;
                match = "ExactSku";
                reasons.Add("exact variant SKU");
            }
            else if (nameKey is not null &&
                     AiOrderTextNormalization.NormalizeComparison(product.Name) == nameKey)
            {
                score = 0.94m;
                match = "ExactNormalizedName";
                reasons.Add("exact normalized name");
            }
            else if (nameKey is not null)
            {
                var similarity = TokenSimilarity(
                    nameKey,
                    AiOrderTextNormalization.NormalizeComparison(product.Name) ?? string.Empty);
                if (similarity < 0.35m)
                    continue;
                score = 0.35m + (similarity * 0.40m);
                reasons.Add("constrained name similarity");
            }
            else
            {
                continue;
            }

            if (!product.IsActive)
            {
                score -= 0.30m;
                warnings.Add("catalogue product is inactive");
            }

            var available = product.Variants.Where(x => x.IsAvailable).ToArray();
            if (colourKey is not null)
            {
                if (available.Any(x => AiOrderTextNormalization.NormalizeComparison(x.Colour) == colourKey))
                {
                    score += 0.03m;
                    reasons.Add("written colour exists");
                }
                else
                {
                    score -= 0.10m;
                    warnings.Add("written colour is unavailable");
                }
            }

            if (sizeKeys.Count > 0)
            {
                var availableSizes = available
                    .Select(x => AiOrderTextNormalization.NormalizeComparison(x.Size))
                    .Where(x => x is not null)
                    .Cast<string>()
                    .ToHashSet(StringComparer.Ordinal);
                if (sizeKeys.All(availableSizes.Contains))
                {
                    score += 0.03m;
                    reasons.Add("all written sizes exist");
                }
                else
                {
                    score -= 0.08m;
                    warnings.Add("one or more written sizes are unavailable");
                }
            }

            matches.Add((product, Math.Clamp(score, 0m, 1m), match, reasons, warnings));
        }

        return matches
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Product.Name, StringComparer.Ordinal)
            .ThenBy(x => x.Product.Id)
            .Take(AiOrderValidationVersions.MaximumProductCandidates)
            .Select(x => new JsonObject
            {
                ["productId"] = x.Product.Id,
                ["productName"] = x.Product.Name,
                ["productKind"] = x.Product.Kind.ToString(),
                ["pricingModel"] = x.Product.PricingModel.ToString(),
                ["active"] = x.Product.IsActive,
                ["score"] = x.Score,
                ["recommendation"] =
                    x.Product.IsActive &&
                    x.Match is ("ExactSku" or "ExactNormalizedName")
                        ? "Recommended"
                        : "Candidate",
                ["matchKind"] = x.Match,
                ["reasons"] = new JsonArray(
                    x.Reasons.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
                ["warnings"] = new JsonArray(
                    x.Warnings.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
            })
            .ToArray();
    }

    public IReadOnlyList<JsonObject> MatchVariants(
        AiOrderCatalogueProductSnapshot product,
        string? writtenSku,
        string? colour,
        string? size)
    {
        var skuKey = AiOrderTextNormalization.NormalizeProductCode(writtenSku);
        var colourKey = AiOrderTextNormalization.NormalizeComparison(colour);
        var sizeKey = AiOrderTextNormalization.NormalizeComparison(size);
        return product.Variants
            .Where(variant =>
                (skuKey is null ||
                 AiOrderTextNormalization.NormalizeProductCode(variant.Sku) == skuKey) &&
                (colourKey is null ||
                 AiOrderTextNormalization.NormalizeComparison(variant.Colour) == colourKey) &&
                (sizeKey is null ||
                 AiOrderTextNormalization.NormalizeComparison(variant.Size) == sizeKey))
            .OrderByDescending(x => x.IsAvailable)
            .ThenBy(x => x.Sku, StringComparer.Ordinal)
            .ThenBy(x => x.Id)
            .Take(AiOrderValidationVersions.MaximumVariantCandidates)
            .Select(variant => new JsonObject
            {
                ["productVariantId"] = variant.Id,
                ["sku"] = variant.Sku,
                ["colour"] = variant.Colour,
                ["size"] = variant.Size,
                ["available"] = variant.IsAvailable,
                ["score"] = variant.IsAvailable ? 1.0m : 0.5m,
            })
            .ToArray();
    }

    private static decimal TokenSimilarity(string left, string right)
    {
        var leftTokens = left.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        var rightTokens = right.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        if (leftTokens.Count == 0 || rightTokens.Count == 0)
            return 0;
        var intersection = leftTokens.Intersect(rightTokens).Count();
        var union = leftTokens.Union(rightTokens).Count();
        return union == 0 ? 0 : (decimal)intersection / union;
    }
}

public sealed class AiOrderGroupingNormalizer :
    IAiOrderGroupingNormalizer,
    ITransientDependency
{
    public string CreateTypedGroupKey(JsonObject fragment)
    {
        var key = new JsonArray
        {
            Typed("product", fragment["productIdentity"]),
            Typed("garmentColour", fragment["colourKey"]),
            Typed("supplySource", fragment["supplySourceKey"]),
            Typed("artworkIdentity", fragment["artworkKey"]),
            Typed("printPlacements", fragment["printingKey"]),
            Typed("productionNotes", fragment["productionNotesKey"]),
            Typed("pricing", fragment["pricingKey"]),
        };
        return AiOrderTextNormalization.Sha256(key.ToJsonString(CompactJson));
    }

    private static JsonObject Typed(string type, JsonNode? value) =>
        new()
        {
            ["type"] = type,
            ["value"] = value?.DeepClone(),
        };

    private static readonly JsonSerializerOptions CompactJson = new()
    {
        WriteIndented = false,
    };
}

public sealed class AiOrderFinancialValidator :
    IAiOrderFinancialValidator,
    ITransientDependency
{
    public JsonObject Normalize(
        JsonObject sourceFinancials,
        IList<JsonObject> issues,
        decimal confidenceThreshold)
    {
        var orderTotal = NormalizeMoneyEvidence(
            sourceFinancials["orderTotal"] as JsonObject,
            "/financials/orderTotal",
            "ORDER_TOTAL_MISSING",
            issues,
            confidenceThreshold);
        var deposit = NormalizeMoneyEvidence(
            sourceFinancials["depositPaid"] as JsonObject,
            "/financials/depositPaid",
            "DEPOSIT_PAID_MISSING",
            issues,
            confidenceThreshold);
        var writtenBalance = NormalizeMoneyEvidence(
            sourceFinancials["writtenBalance"] as JsonObject,
            "/financials/writtenBalance",
            null,
            issues,
            confidenceThreshold,
            required: false);

        AddAlternativeConflicts(sourceFinancials, issues);

        JsonObject? balanceDue = null;
        var status = "Incomplete";
        var totalAmount = Amount(orderTotal);
        var depositAmount = Amount(deposit);
        if (totalAmount.HasValue && depositAmount.HasValue)
        {
            if (depositAmount > totalAmount)
            {
                status = "Invalid";
                AddIssue(
                    issues,
                    "DEPOSIT_EXCEEDS_TOTAL",
                    "Conflict",
                    true,
                    ["/financials/depositPaid", "/financials/orderTotal"],
                    "Deposit Paid must not exceed Order Total.",
                    [depositAmount.Value.ToString("0.00"), totalAmount.Value.ToString("0.00")],
                    MergeRefs(orderTotal, deposit));
            }
            else
            {
                var balance = totalAmount.Value - depositAmount.Value;
                balanceDue = Money("NZD", balance);
                status = "Complete";
                var written = Amount(writtenBalance);
                if (written.HasValue && written.Value != balance)
                {
                    AddIssue(
                        issues,
                        "FINANCIAL_BALANCE_MISMATCH",
                        "Conflict",
                        true,
                        ["/financials/writtenBalance", "/financials/balanceDue"],
                        "Written balance does not equal Order Total minus Deposit Paid.",
                        [written.Value.ToString("0.00"), balance.ToString("0.00")],
                        MergeRefs(writtenBalance, orderTotal, deposit));
                }
            }
        }

        return new JsonObject
        {
            ["orderTotal"] = orderTotal,
            ["depositPaid"] = deposit,
            ["writtenBalance"] = writtenBalance,
            ["balanceDue"] = balanceDue,
            ["derivationStatus"] = status,
            ["catalogueQuote"] = new JsonObject
            {
                ["status"] = "Unavailable",
                ["amount"] = null,
                ["differenceFromWrittenTotal"] = null,
                ["reason"] = "A complete confirmed catalogue selection is not available in Jira 10205.",
            },
        };
    }

    private static JsonObject NormalizeMoneyEvidence(
        JsonObject? source,
        string path,
        string? missingCode,
        IList<JsonObject> issues,
        decimal confidenceThreshold,
        bool required = true)
    {
        var presence = source?["presence"]?.GetValue<string>() ?? "missing";
        var sourceValue = source?["value"] as JsonObject;
        var sourceAmount = sourceValue?["amount"]?.GetValue<string>();
        var currency = sourceValue?["currency"]?.GetValue<string>();
        var valid = AiOrderTextNormalization.TryNormalizeMoney(
            sourceAmount,
            out var amount,
            out var error);
        if (required && (presence == "missing" || sourceValue is null))
        {
            AddIssue(
                issues,
                missingCode!,
                "MissingRequired",
                true,
                [path],
                missingCode == "DEPOSIT_PAID_MISSING"
                    ? "Deposit Paid must be stated; an explicit zero is valid."
                    : "Order Total is required.",
                [],
                CloneArray(source?["sourceRefs"]));
        }
        else if (required && !valid)
        {
            AddIssue(
                issues,
                missingCode == "ORDER_TOTAL_MISSING"
                    ? "ORDER_TOTAL_MULTIPLE_VALUES"
                    : "DEPOSIT_MULTIPLE_VALUES",
                "Conflict",
                true,
                [path],
                error == "fractional-cent"
                    ? "Financial values must use exact cents and are never silently rounded."
                    : "The financial value is invalid.",
                sourceAmount is null ? [] : [sourceAmount],
                CloneArray(source?["sourceRefs"]));
        }

        if (valid && currency is not null &&
            !string.Equals(currency, "NZD", StringComparison.OrdinalIgnoreCase))
        {
            AddIssue(
                issues,
                "CURRENCY_INFERRED",
                "NeedsConfirmation",
                required,
                [path],
                "Confirm the currency before using this required financial value.",
                [currency],
                CloneArray(source?["sourceRefs"]));
        }
        if (valid && presence == "inferred")
        {
            AddIssue(
                issues,
                "CURRENCY_INFERRED",
                "NeedsConfirmation",
                required,
                [path],
                "The financial value or currency was inferred and requires confirmation.",
                [amount!],
                CloneArray(source?["sourceRefs"]));
        }
        AddLowConfidence(source, path, required, issues, confidenceThreshold);

        return Evidence(
            source,
            valid ? new JsonObject
            {
                ["currency"] = (currency ?? "NZD").ToUpperInvariant(),
                ["amount"] = amount,
            } : null,
            sourceAmount,
            valid ? "money-exact-cents-v1" : error ?? "missing",
            requiresConfirmation: presence == "inferred" || !valid);
    }

    private static void AddAlternativeConflicts(
        JsonObject sourceFinancials,
        IList<JsonObject> issues)
    {
        if (sourceFinancials["alternatives"] is not JsonArray alternatives)
            return;
        var totalValues = alternatives
            .OfType<JsonObject>()
            .Where(x => (x["field"]?.GetValue<string>() ?? string.Empty)
                .Contains("total", StringComparison.OrdinalIgnoreCase))
            .Select(x => x["value"]?.ToJsonString())
            .Where(x => x is not null)
            .Cast<string>()
            .Distinct()
            .ToArray();
        if (totalValues.Length > 0)
            AddIssue(
                issues,
                "ORDER_TOTAL_MULTIPLE_VALUES",
                "Conflict",
                true,
                ["/financials/orderTotal"],
                "The source contains multiple possible order totals.",
                totalValues,
                []);

        var depositValues = alternatives
            .OfType<JsonObject>()
            .Where(x => (x["field"]?.GetValue<string>() ?? string.Empty)
                .Contains("deposit", StringComparison.OrdinalIgnoreCase))
            .Select(x => x["value"]?.ToJsonString())
            .Where(x => x is not null)
            .Cast<string>()
            .Distinct()
            .ToArray();
        if (depositValues.Length > 0)
            AddIssue(
                issues,
                "DEPOSIT_MULTIPLE_VALUES",
                "Conflict",
                true,
                ["/financials/depositPaid"],
                "The source contains multiple possible deposit values.",
                depositValues,
                []);
    }

    internal static JsonObject Evidence(
        JsonObject? source,
        JsonNode? normalizedValue,
        string? originalValue,
        string rule,
        bool requiresConfirmation)
    {
        var presence = source?["presence"]?.GetValue<string>() ?? "missing";
        return new JsonObject
        {
            ["presence"] = presence,
            ["value"] = normalizedValue,
            ["sourceText"] = source?["sourceText"]?.DeepClone(),
            ["confidence"] = source?["confidence"]?.DeepClone(),
            ["sourceRefs"] = CloneArray(source?["sourceRefs"]),
            ["normalization"] = new JsonObject
            {
                ["originalValue"] = originalValue,
                ["normalizedValue"] = normalizedValue?.DeepClone(),
                ["rule"] = rule,
                ["requiresConfirmation"] = requiresConfirmation,
            },
        };
    }

    internal static void AddLowConfidence(
        JsonObject? evidence,
        string path,
        bool blocking,
        IList<JsonObject> issues,
        decimal threshold)
    {
        if (evidence?["confidence"] is not JsonValue confidenceNode ||
            !confidenceNode.TryGetValue<decimal>(out var confidence) ||
            confidence >= threshold)
            return;
        AddIssue(
            issues,
            "LOW_CONFIDENCE_REQUIRED_FIELD",
            "NeedsConfirmation",
            blocking,
            [path],
            "The provider confidence for this required field is below the review threshold.",
            [confidence.ToString(CultureInfo.InvariantCulture)],
            CloneArray(evidence["sourceRefs"]));
    }

    internal static void AddIssue(
        IList<JsonObject> issues,
        string code,
        string category,
        bool blocking,
        IEnumerable<string> paths,
        string message,
        IEnumerable<string> observedValues,
        JsonArray sourceRefs)
    {
        var pathArray = new JsonArray(
            paths.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray());
        var observed = new JsonArray(
            observedValues.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray());
        var identity = $"{code}\n{pathArray.ToJsonString()}\n{observed.ToJsonString()}";
        issues.Add(new JsonObject
        {
            ["issueId"] = AiOrderTextNormalization.Sha256(identity)[..32],
            ["code"] = code,
            ["category"] = category,
            ["severity"] = blocking ? "Blocking" : "Warning",
            ["paths"] = pathArray,
            ["message"] = message,
            ["observedValues"] = observed,
            ["sourceRefs"] = sourceRefs,
            ["resolution"] = new JsonObject
            {
                ["status"] = "Open",
            },
        });
    }

    internal static JsonArray CloneArray(JsonNode? node) =>
        node is JsonArray array
            ? new JsonArray(array.Select(x => x?.DeepClone()).ToArray())
            : [];

    private static JsonArray MergeRefs(params JsonObject[] evidence)
    {
        var refs = evidence
            .SelectMany(x => (x["sourceRefs"] as JsonArray ?? []).Select(y => y?.DeepClone()))
            .ToArray();
        return new JsonArray(refs);
    }

    private static decimal? Amount(JsonObject evidence)
    {
        var text = evidence["value"]?["amount"]?.GetValue<string>();
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static JsonObject Money(string currency, decimal amount) =>
        new()
        {
            ["currency"] = currency,
            ["amount"] = amount.ToString("0.00", CultureInfo.InvariantCulture),
        };
}
