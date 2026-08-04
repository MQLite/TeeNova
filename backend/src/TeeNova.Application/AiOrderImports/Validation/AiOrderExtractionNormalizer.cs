using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Validation;

public sealed class AiOrderExtractionNormalizer :
    IAiOrderExtractionNormalizer,
    ITransientDependency
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    private readonly IAiOrderCatalogueMatcher _matcher;
    private readonly IAiOrderGroupingNormalizer _grouping;
    private readonly IAiOrderFinancialValidator _financials;
    private readonly AiOrderValidationOptions _options;

    public AiOrderExtractionNormalizer(
        IAiOrderCatalogueMatcher matcher,
        IAiOrderGroupingNormalizer grouping,
        IAiOrderFinancialValidator financials,
        IOptions<AiOrderValidationOptions> options)
    {
        _matcher = matcher;
        _grouping = grouping;
        _financials = financials;
        _options = options.Value;
    }

    public AiOrderValidationBuildResult NormalizeAndValidate(
        Guid importId,
        int sourceAiRevisionNumber,
        Guid sourceAiRevisionId,
        string sourceAiSha256,
        string aiCanonicalJson,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        DateTime catalogueValidatedAt)
    {
        var source = JsonNode.Parse(aiCanonicalJson) as JsonObject
                     ?? throw new BusinessException(
                         "TeeNova:AiOrderImport:ValidationSourceInvalid");
        if (source["contractVersion"]?.GetValue<string>() != "1.0")
            throw new BusinessException(
                "TeeNova:AiOrderImport:ValidationContractUnsupported");

        var catalogueFingerprint = CreateCatalogueFingerprint(catalogue);
        var validationInputHash = AiOrderTextNormalization.Sha256(string.Join(
            "\n",
            importId.ToString("D"),
            sourceAiRevisionId.ToString("D"),
            sourceAiSha256,
            AiOrderValidationVersions.Validation,
            AiOrderValidationVersions.NormalizationRules,
            catalogueFingerprint));

        var issues = new List<JsonObject>();
        var customer = NormalizeCustomer(source["customer"] as JsonObject, issues);
        var fragments = NormalizeFragments(
            source["productGroups"] as JsonArray ?? [],
            catalogue,
            issues);
        var groups = BuildGroups(fragments, catalogue, issues);
        if (groups.Count == 0)
        {
            AiOrderFinancialValidator.AddIssue(
                issues,
                "PRODUCT_MISSING",
                "MissingRequired",
                true,
                ["/productGroups"],
                "At least one product group is required.",
                [],
                []);
        }

        var financials = _financials.Normalize(
            source["financials"] as JsonObject ?? new JsonObject(),
            issues,
            _options.RequiredFieldConfidenceThreshold);
        var orderedIssues = issues
            .OrderBy(x => x["code"]?.GetValue<string>(), StringComparer.Ordinal)
            .ThenBy(x => x["paths"]?.ToJsonString(), StringComparer.Ordinal)
            .ThenBy(x => x["issueId"]?.GetValue<string>(), StringComparer.Ordinal)
            .ToArray();
        var blockingCount = orderedIssues.Count(
            x => x["severity"]?.GetValue<string>() == "Blocking");
        var warningCount = orderedIssues.Length - blockingCount;

        var normalizedContent = new JsonObject
        {
            ["customer"] = customer.DeepClone(),
            ["productGroups"] = new JsonArray(groups.Select(x => x.DeepClone()).ToArray()),
            ["financials"] = financials.DeepClone(),
            ["issues"] = new JsonArray(orderedIssues.Select(x => x.DeepClone()).ToArray()),
        };
        var normalizedContentSha256 = AiOrderTextNormalization.Sha256(
            normalizedContent.ToJsonString(JsonOptions));
        var document = new JsonObject
        {
            ["contractVersion"] = "1.0",
            ["validationVersion"] = AiOrderValidationVersions.Validation,
            ["normalizationRuleVersion"] = AiOrderValidationVersions.NormalizationRules,
            ["colourPolicyVersion"] = AiOrderValidationVersions.ColourPolicy,
            ["sizePolicyVersion"] = AiOrderValidationVersions.SizePolicy,
            ["importId"] = importId,
            ["sourceAiRevision"] = new JsonObject
            {
                ["id"] = sourceAiRevisionId,
                ["revision"] = sourceAiRevisionNumber,
                ["canonicalSha256"] = sourceAiSha256,
            },
            ["validationInputHash"] = validationInputHash,
            ["catalogueFingerprint"] = catalogueFingerprint,
            ["catalogueValidatedAt"] = catalogueValidatedAt.ToUniversalTime()
                .ToString("O", CultureInfo.InvariantCulture),
            ["catalogueValidationStatus"] = "Current",
            ["requiresRevalidation"] = false,
            ["normalizedContentSha256"] = normalizedContentSha256,
            ["customer"] = customer,
            ["productGroups"] = new JsonArray(groups.Select(x => (JsonNode)x).ToArray()),
            ["financials"] = financials,
            ["issues"] = new JsonArray(orderedIssues.Select(x => (JsonNode)x).ToArray()),
            ["issueCount"] = orderedIssues.Length,
            ["blockingIssueCount"] = blockingCount,
            ["warningCount"] = warningCount,
        };
        var canonicalJson = document.ToJsonString(JsonOptions);
        var canonicalSha256 = AiOrderTextNormalization.Sha256(canonicalJson);
        return new AiOrderValidationBuildResult(
            document,
            canonicalJson,
            canonicalSha256,
            validationInputHash,
            catalogueFingerprint,
            orderedIssues.Length,
            blockingCount,
            warningCount);
    }

    public static string CreateCatalogueFingerprint(
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue)
    {
        var products = new JsonArray(catalogue
            .OrderBy(x => x.Id)
            .Select(product => (JsonNode)new JsonObject
            {
                ["id"] = product.Id,
                ["name"] = product.Name,
                ["kind"] = product.Kind.ToString(),
                ["pricingModel"] = product.PricingModel.ToString(),
                ["active"] = product.IsActive,
                ["variants"] = new JsonArray(product.Variants
                    .OrderBy(x => x.Id)
                    .Select(variant => (JsonNode)new JsonObject
                    {
                        ["id"] = variant.Id,
                        ["sku"] = variant.Sku,
                        ["colour"] = variant.Colour,
                        ["size"] = variant.Size,
                        ["available"] = variant.IsAvailable,
                    })
                    .ToArray()),
            })
            .ToArray());
        return AiOrderTextNormalization.Sha256(products.ToJsonString(JsonOptions));
    }

    private JsonObject NormalizeCustomer(
        JsonObject? source,
        IList<JsonObject> issues)
    {
        var name = NormalizeStringEvidence(source?["name"] as JsonObject, "text-nfkc-v1");
        var company = NormalizeStringEvidence(source?["company"] as JsonObject, "text-nfkc-v1");
        var address = NormalizeStringEvidence(
            source?["addressOrFulfilmentNotes"] as JsonObject,
            "text-nfkc-v1");

        var phoneSource = source?["phone"] as JsonObject;
        var phoneOriginal = StringValue(phoneSource);
        var phoneValue = AiOrderTextNormalization.NormalizePhone(phoneOriginal, out var phoneUncertain);
        var phone = AiOrderFinancialValidator.Evidence(
            phoneSource,
            JsonValue.Create(phoneValue),
            phoneOriginal,
            "phone-safe-format-v1",
            phoneUncertain);

        var emailSource = source?["email"] as JsonObject;
        var emailOriginal = StringValue(emailSource);
        var emailValue = AiOrderTextNormalization.NormalizeEmail(emailOriginal, out var emailValid);
        var email = AiOrderFinancialValidator.Evidence(
            emailSource,
            JsonValue.Create(emailValue),
            emailOriginal,
            "email-trim-lower-v1",
            !emailValid);

        if (name["presence"]?.GetValue<string>() == "missing")
            AddCustomerWarning(
                issues,
                "CUSTOMER_NAME_MISSING",
                "/customer/name",
                "Customer name is missing.",
                name);
        if (phone["presence"]?.GetValue<string>() == "missing" &&
            email["presence"]?.GetValue<string>() == "missing")
        {
            AddCustomerWarning(
                issues,
                "CUSTOMER_CONTACT_MISSING",
                "/customer",
                "Customer phone and email are both missing.",
                name);
        }
        if (!emailValid)
            AddCustomerWarning(
                issues,
                "CUSTOMER_EMAIL_INVALID",
                "/customer/email",
                "Customer email syntax is invalid.",
                email);
        if (phoneUncertain)
            AddCustomerWarning(
                issues,
                "CUSTOMER_PHONE_UNCERTAIN",
                "/customer/phone",
                "Customer phone could not be safely normalized.",
                phone);

        return new JsonObject
        {
            ["name"] = name,
            ["phone"] = phone,
            ["email"] = email,
            ["organisation"] = company,
            ["addressOrFulfilmentNotes"] = address,
        };
    }

    private List<JsonObject> NormalizeFragments(
        JsonArray sourceGroups,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        IList<JsonObject> issues)
    {
        var colourVocabulary = catalogue
            .SelectMany(x => x.Variants)
            .Select(x => x.Colour)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var sizeVocabulary = catalogue
            .SelectMany(x => x.Variants)
            .Select(x => x.Size)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var fragments = new List<JsonObject>();
        for (var sourceIndex = 0; sourceIndex < sourceGroups.Count; sourceIndex++)
        {
            if (sourceGroups[sourceIndex] is not JsonObject sourceGroup)
                continue;
            var productEvidence = sourceGroup["writtenProductDescription"] as JsonObject;
            var productName = AiOrderTextNormalization.NormalizeText(StringValue(productEvidence));
            var codeEvidence = sourceGroup["supplierOrProductCode"] as JsonObject;
            var productCode = AiOrderTextNormalization.NormalizeProductCode(StringValue(codeEvidence));
            var colour = NormalizeColour(
                sourceGroup["garmentColour"] as JsonObject,
                colourVocabulary);
            var supply = NormalizeSupplySource(
                sourceGroup["supplySource"] as JsonObject);
            var artwork = NormalizeStringEvidence(
                sourceGroup["artworkIdentity"] as JsonObject,
                "artwork-identity-text-v1");
            var artworkDescription = NormalizeStringEvidence(
                sourceGroup["artworkDescription"] as JsonObject,
                "text-nfkc-v1");
            var printing = NormalizePrinting(sourceGroup["printing"] as JsonArray ?? []);
            var sizeRows = NormalizeSizeRows(
                sourceGroup["sizeQuantityRows"] as JsonArray ?? [],
                sizeVocabulary);
            var sizes = sizeRows
                .Select(x => x["size"]?["value"]?["label"]?.GetValue<string>())
                .Where(x => x is not null)
                .Cast<string>()
                .ToArray();
            var candidates = _matcher.MatchProducts(
                productName,
                productCode,
                colour["value"]?["label"]?.GetValue<string>(),
                sizes,
                catalogue);
            var exactCandidateId = candidates
                .FirstOrDefault(x => x["recommendation"]?.GetValue<string>() == "Recommended")?
                ["productId"]?.GetValue<Guid>();
            var proposalIdentity = AiOrderTextNormalization.Sha256(string.Join(
                "\n",
                AiOrderTextNormalization.NormalizeComparison(productName),
                productCode,
                AiOrderTextNormalization.NormalizeComparison(
                    sourceGroup["brand"]?["value"]?.GetValue<string>()),
                AiOrderTextNormalization.NormalizeComparison(
                    sourceGroup["supplier"]?["value"]?.GetValue<string>())));
            var productIdentity = exactCandidateId.HasValue
                ? $"catalogue-candidate:{exactCandidateId.Value:D}"
                : $"ad-hoc-proposal:{proposalIdentity}";
            var printingKey = new JsonArray(printing
                .Select(x => x.DeepClone())
                .OrderBy(x => x!.ToJsonString(), StringComparer.Ordinal)
                .ToArray());
            var fragment = new JsonObject
            {
                ["sourceGroupIndex"] = sourceIndex,
                ["sourceIdentity"] = AiOrderTextNormalization.Sha256(sourceGroup.ToJsonString()),
                ["productIdentity"] = productIdentity,
                ["proposalIdentity"] = proposalIdentity,
                ["productName"] = productName,
                ["productCode"] = productCode,
                ["writtenProductDescription"] = AiOrderFinancialValidator.Evidence(
                    productEvidence,
                    JsonValue.Create(productName),
                    StringValue(productEvidence),
                    "text-nfkc-v1",
                    productEvidence?["presence"]?.GetValue<string>() == "inferred"),
                ["brand"] = NormalizeStringEvidence(sourceGroup["brand"] as JsonObject, "text-nfkc-v1"),
                ["supplier"] = NormalizeStringEvidence(sourceGroup["supplier"] as JsonObject, "text-nfkc-v1"),
                ["supplierOrProductCode"] = AiOrderFinancialValidator.Evidence(
                    codeEvidence,
                    JsonValue.Create(productCode),
                    StringValue(codeEvidence),
                    "product-code-v1",
                    false),
                ["colour"] = colour,
                ["colourKey"] = AiOrderTextNormalization.NormalizeComparison(
                    colour["value"]?["label"]?.GetValue<string>()),
                ["supplySource"] = supply,
                ["supplySourceKey"] = AiOrderTextNormalization.NormalizeComparison(
                    supply["value"]?.GetValue<string>()),
                ["artworkIdentity"] = artwork,
                ["artworkDescription"] = artworkDescription,
                ["artworkKey"] = AiOrderTextNormalization.NormalizeComparison(
                    artwork["value"]?.GetValue<string>()),
                ["printing"] = new JsonArray(printing.Select(x => (JsonNode)x).ToArray()),
                ["printingKey"] = printingKey,
                ["productionNotesKey"] = AiOrderTextNormalization.NormalizeComparison(
                    artworkDescription["value"]?.GetValue<string>()),
                ["pricingKey"] = null,
                ["sourceText"] = sourceGroup["sourceText"]?.DeepClone(),
                ["sourceRefs"] = AiOrderFinancialValidator.CloneArray(sourceGroup["sourceRefs"]),
                ["confidence"] = sourceGroup["confidence"]?.DeepClone(),
                ["sourceWarnings"] = sourceGroup["warnings"]?.DeepClone() ?? new JsonArray(),
                ["sourceAlternatives"] = sourceGroup["alternatives"]?.DeepClone() ?? new JsonArray(),
                ["sizeRows"] = new JsonArray(sizeRows.Select(x => (JsonNode)x).ToArray()),
                ["candidates"] = new JsonArray(candidates.Select(x => (JsonNode)x).ToArray()),
            };
            fragment["groupKey"] = _grouping.CreateTypedGroupKey(fragment);
            fragments.Add(fragment);
        }
        return fragments;
    }

    private List<JsonObject> BuildGroups(
        IReadOnlyList<JsonObject> fragments,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        IList<JsonObject> issues)
    {
        var groups = new List<JsonObject>();
        var grouped = fragments
            .GroupBy(x => x["groupKey"]!.GetValue<string>(), StringComparer.Ordinal)
            .OrderBy(x => x.Key, StringComparer.Ordinal)
            .ToArray();
        for (var groupIndex = 0; groupIndex < grouped.Length; groupIndex++)
        {
            var fragmentSet = grouped[groupIndex]
                .OrderBy(x => x["sourceIdentity"]!.GetValue<string>(), StringComparer.Ordinal)
                .ToArray();
            var first = fragmentSet[0];
            var rows = fragmentSet
                .SelectMany(x => (x["sizeRows"] as JsonArray ?? []).OfType<JsonObject>())
                .ToArray();
            var groupedRows = rows
                .GroupBy(
                    x => x["size"]?["normalization"]?["normalizedValue"]?["label"]?.GetValue<string>()
                         ?? $"missing:{x["sourceRowIdentity"]}",
                    StringComparer.Ordinal)
                .OrderBy(x => x.Key, StringComparer.Ordinal)
                .ToArray();
            var normalizedRows = new JsonArray();
            for (var rowIndex = 0; rowIndex < groupedRows.Length; rowIndex++)
            {
                var rowSet = groupedRows[rowIndex].ToArray();
                var representative = rowSet[0].DeepClone() as JsonObject ?? new JsonObject();
                representative.Remove("sourceRowIdentity");
                representative["sourceEvidence"] = new JsonArray(rowSet.Select(row => (JsonNode)new JsonObject
                {
                    ["size"] = row["size"]?.DeepClone(),
                    ["quantity"] = row["quantity"]?.DeepClone(),
                    ["sourceText"] = row["sourceText"]?.DeepClone(),
                }).ToArray());

                if (rowSet.Length > 1)
                {
                    var quantities = rowSet
                        .Select(x => x["quantity"]?["value"]?.GetValue<int?>())
                        .Where(x => x.HasValue)
                        .Select(x => x!.Value)
                        .ToArray();
                    representative["proposedCombinedQuantity"] =
                        quantities.Length == rowSet.Length ? quantities.Sum() : null;
                    representative["requiresDuplicateConfirmation"] = true;
                    AiOrderFinancialValidator.AddIssue(
                        issues,
                        "DUPLICATE_SIZE_ROW_UNCERTAIN",
                        "Conflict",
                        true,
                        [$"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}"],
                        "Repeated normalized size rows require confirmation before quantities are combined.",
                        quantities.Select(x => x.ToString(CultureInfo.InvariantCulture)),
                        MergeRowRefs(rowSet));
                    if (quantities.Distinct().Count() > 1)
                    {
                        AiOrderFinancialValidator.AddIssue(
                            issues,
                            "QUANTITY_MULTIPLE_VALUES",
                            "Conflict",
                            true,
                            [$"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/quantity"],
                            "Repeated evidence contains different quantities for the same normalized size.",
                            quantities.Select(x => x.ToString(CultureInfo.InvariantCulture)),
                            MergeRowRefs(rowSet));
                    }
                }
                else
                {
                    representative["proposedCombinedQuantity"] =
                        representative["quantity"]?["value"]?.DeepClone();
                    representative["requiresDuplicateConfirmation"] = false;
                }
                normalizedRows.Add(representative);
            }

            var candidates = fragmentSet
                .SelectMany(x => (x["candidates"] as JsonArray ?? []).OfType<JsonObject>())
                .GroupBy(x => x["productId"]!.GetValue<Guid>())
                .Select(group => group
                    .OrderByDescending(x => x["score"]!.GetValue<decimal>())
                    .First())
                .OrderByDescending(x => x["score"]!.GetValue<decimal>())
                .ThenBy(x => x["productName"]!.GetValue<string>(), StringComparer.Ordinal)
                .Take(AiOrderValidationVersions.MaximumProductCandidates)
                .Select(x => x.DeepClone() as JsonObject ?? new JsonObject())
                .ToArray();
            AddVariantCandidates(candidates, normalizedRows, first, catalogue, issues, groupIndex);

            var productName = first["productName"]?.GetValue<string>();
            var productMissing = string.IsNullOrWhiteSpace(productName);
            JsonObject? adHoc = null;
            if (productMissing)
            {
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    "PRODUCT_MISSING",
                    "MissingRequired",
                    true,
                    [$"/productGroups/{groupIndex}/writtenProductDescription"],
                    "Product is required.",
                    [],
                    EvidenceRefs(first["writtenProductDescription"] as JsonObject));
            }
            else if (candidates.Length > 0)
            {
                AddProductUnresolved(issues, groupIndex, productName!, first);
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    candidates.Length > 1 &&
                    candidates.Count(x => x["recommendation"]?.GetValue<string>() == "Recommended") == 0
                        ? "PRODUCT_MATCH_AMBIGUOUS"
                        : "PRODUCT_MATCH_CONFIRMATION_REQUIRED",
                    "NeedsConfirmation",
                    true,
                    [$"/productGroups/{groupIndex}/productResolution"],
                    "Select and confirm a catalogue product; candidates are advisory only.",
                    candidates.Select(x => x["productName"]!.GetValue<string>()),
                    EvidenceRefs(first["writtenProductDescription"] as JsonObject));
            }
            else
            {
                var proposalId = first["proposalIdentity"]!.GetValue<string>()[..32];
                adHoc = new JsonObject
                {
                    ["proposalId"] = proposalId,
                    ["writtenName"] = productName,
                    ["normalizedDisplayName"] = productName,
                    ["brand"] = first["brand"]?["value"]?.DeepClone(),
                    ["supplierName"] = first["supplier"]?["value"]?.DeepClone(),
                    ["supplierCode"] = first["supplierOrProductCode"]?["value"]?.DeepClone(),
                    ["supplySource"] = first["supplySource"]?["value"]?.DeepClone(),
                    ["inventoryBehavior"] = "NotTracked",
                    ["confirmed"] = false,
                };
                // Nothing in the catalogue matches, so there is no choice for staff to
                // make: the group is created as an ad-hoc product and only advertised.
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    "AD_HOC_PRODUCT_CREATED",
                    "NeedsConfirmation",
                    false,
                    [$"/productGroups/{groupIndex}/productResolution/adHocProposal"],
                    "No catalogue product matched; this group was created as an ad-hoc product.",
                    [productName!],
                    EvidenceRefs(first["writtenProductDescription"] as JsonObject));
            }

            AddQuantitySumConflictIfPresent(
                fragmentSet,
                normalizedRows,
                issues,
                groupIndex);
            ValidateGroupRequiredFields(first, normalizedRows, issues, groupIndex);
            var sourceEvidence = fragmentSet.Select(fragment => (JsonNode)new JsonObject
            {
                ["sourceIdentity"] = fragment["sourceIdentity"]?.DeepClone(),
                ["sourceText"] = fragment["sourceText"]?.DeepClone(),
                ["sourceRefs"] = fragment["sourceRefs"]?.DeepClone(),
                ["confidence"] = fragment["confidence"]?.DeepClone(),
                ["warnings"] = fragment["sourceWarnings"]?.DeepClone(),
                ["alternatives"] = fragment["sourceAlternatives"]?.DeepClone(),
            }).ToArray();
            groups.Add(new JsonObject
            {
                ["groupId"] = grouped[groupIndex].Key[..32],
                ["groupingKeySha256"] = grouped[groupIndex].Key,
                ["groupingKeyVersion"] = "typed-canonical-json-v1",
                ["writtenProductDescription"] = first["writtenProductDescription"]?.DeepClone(),
                ["brand"] = first["brand"]?.DeepClone(),
                ["supplier"] = first["supplier"]?.DeepClone(),
                ["supplierOrProductCode"] = first["supplierOrProductCode"]?.DeepClone(),
                ["productResolution"] = new JsonObject
                {
                    ["mode"] = productMissing
                        ? "Unresolved"
                        : candidates.Length > 0 ? "CatalogueCandidates" : "AdHocProposal",
                    ["confirmedCatalogueProduct"] = null,
                    ["productCandidates"] = new JsonArray(candidates.Select(x => (JsonNode)x).ToArray()),
                    ["adHocProposal"] = adHoc,
                },
                ["colour"] = first["colour"]?.DeepClone(),
                ["supplySource"] = first["supplySource"]?.DeepClone(),
                ["artworkIdentity"] = first["artworkIdentity"]?.DeepClone(),
                ["artworkDescription"] = first["artworkDescription"]?.DeepClone(),
                ["printing"] = first["printing"]?.DeepClone(),
                ["sizeQuantityRows"] = normalizedRows,
                ["sourceEvidence"] = new JsonArray(sourceEvidence),
            });
        }
        return groups;
    }

    private void AddVariantCandidates(
        IReadOnlyList<JsonObject> candidates,
        JsonArray rows,
        JsonObject fragment,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        IList<JsonObject> issues,
        int groupIndex)
    {
        var colour = fragment["colour"]?["value"]?["label"]?.GetValue<string>();
        var writtenSku = fragment["productCode"]?.GetValue<string>();
        foreach (var rowNode in rows)
        {
            if (rowNode is not JsonObject row)
                continue;
            var size = row["size"]?["value"]?["label"]?.GetValue<string>();
            var byProduct = new JsonArray();
            foreach (var candidate in candidates)
            {
                var productId = candidate["productId"]!.GetValue<Guid>();
                var product = catalogue.Single(x => x.Id == productId);
                var variants = _matcher.MatchVariants(
                    product,
                    writtenSku,
                    colour,
                    size);
                byProduct.Add(new JsonObject
                {
                    ["productId"] = productId,
                    ["variants"] = new JsonArray(variants.Select(x => (JsonNode)x).ToArray()),
                });

                var recommended =
                    candidate["recommendation"]?.GetValue<string>() == "Recommended";
                var rowIndex = rows.IndexOf(rowNode);
                var path = $"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/variantCandidates";
                if (!product.IsActive)
                    AddCatalogueIssue(
                        issues,
                        "CATALOGUE_PRODUCT_INACTIVE",
                        path,
                        "A catalogue candidate is inactive.",
                        product.Name,
                        recommended);
                var colourUnavailable =
                    variants.Count == 0 &&
                    colour is not null &&
                    !product.Variants.Any(
                        x => AiOrderTextNormalization.NormalizeComparison(x.Colour) ==
                             AiOrderTextNormalization.NormalizeComparison(colour));
                var sizeUnavailable =
                    variants.Count == 0 &&
                    size is not null &&
                    !product.Variants.Any(
                        x => AiOrderTextNormalization.NormalizeComparison(x.Size) ==
                             AiOrderTextNormalization.NormalizeComparison(size));
                if (colourUnavailable)
                {
                    AddCatalogueIssue(
                        issues,
                        "COLOUR_NOT_AVAILABLE_FOR_PRODUCT",
                        path,
                        "The written colour is not available for this catalogue candidate.",
                        colour!,
                        recommended);
                    if (recommended)
                        AddCatalogueIssue(
                            issues,
                            "PRODUCT_COLOUR_CONFLICT",
                            path,
                            "The recommended product conflicts with the written garment colour.",
                            colour!,
                            true);
                }
                else if (sizeUnavailable)
                {
                    AddCatalogueIssue(
                        issues,
                        "SIZE_NOT_AVAILABLE_FOR_PRODUCT",
                        path,
                        "The written size is not available for this catalogue candidate.",
                        size!,
                        recommended);
                    if (recommended)
                        AddCatalogueIssue(
                            issues,
                            "PRODUCT_SIZE_CONFLICT",
                            path,
                            "The recommended product conflicts with the written size.",
                            size!,
                            true);
                }
                else if (variants.Count == 0)
                    AddCatalogueIssue(
                        issues,
                        "VARIANT_NOT_FOUND",
                        path,
                        "No variant matches the written SKU, colour, and size.",
                        product.Name,
                        recommended);
                else if (variants.Count > 1)
                    AddCatalogueIssue(
                        issues,
                        "VARIANT_AMBIGUOUS",
                        path,
                        "Multiple variants match the written values.",
                        product.Name,
                        recommended);
                else if (variants.Any(x => x["available"]?.GetValue<bool>() == false))
                    AddCatalogueIssue(
                        issues,
                        "CATALOGUE_SELECTION_STALE",
                        path,
                        "The matching variant is inactive or unavailable.",
                        product.Name,
                        recommended);
            }
            row["variantCandidatesByProduct"] = byProduct;
            row["confirmedProductVariantId"] = null;
        }
    }

    private void ValidateGroupRequiredFields(
        JsonObject group,
        JsonArray rows,
        IList<JsonObject> issues,
        int groupIndex)
    {
        var colour = group["colour"] as JsonObject;
        var colourResolution = colour?["resolution"]?.GetValue<string>() ?? "Missing";
        if (colourResolution == "Missing")
            AiOrderFinancialValidator.AddIssue(
                issues,
                "COLOUR_MISSING",
                "MissingRequired",
                true,
                [$"/productGroups/{groupIndex}/colour"],
                "Colour is required or must be controlled Not Applicable.",
                [],
                EvidenceRefs(colour));
        else if (colourResolution == "Ambiguous")
            AddConfirmationIssue(
                issues,
                "COLOUR_AMBIGUOUS",
                $"/productGroups/{groupIndex}/colour",
                "Colour is ambiguous.",
                colour);
        else if (colourResolution == "Custom")
            AddConfirmationIssue(
                issues,
                "COLOUR_CUSTOM",
                $"/productGroups/{groupIndex}/colour",
                "Custom garment colour requires confirmation.",
                colour);
        else if (colourResolution == "NotApplicable")
            AddConfirmationIssue(
                issues,
                "COLOUR_NOT_APPLICABLE_CONFIRMATION_REQUIRED",
                $"/productGroups/{groupIndex}/colour",
                "Not Applicable colour requires confirmation.",
                colour);

        AiOrderFinancialValidator.AddLowConfidence(
            group["writtenProductDescription"] as JsonObject,
            $"/productGroups/{groupIndex}/writtenProductDescription",
            true,
            issues,
            _options.RequiredFieldConfidenceThreshold);
        AiOrderFinancialValidator.AddLowConfidence(
            colour,
            $"/productGroups/{groupIndex}/colour",
            true,
            issues,
            _options.RequiredFieldConfidenceThreshold);
        var supply = group["supplySource"] as JsonObject;
        if (supply?["presence"]?.GetValue<string>() == "inferred" ||
            supply?["normalization"]?["requiresConfirmation"]?.GetValue<bool>() == true)
            AiOrderFinancialValidator.AddIssue(
                issues,
                "SUPPLY_SOURCE_INFERRED",
                "NeedsConfirmation",
                false,
                [$"/productGroups/{groupIndex}/supplySource"],
                "Supply source was inferred and should be confirmed.",
                [supply["value"]?.GetValue<string>() ?? string.Empty],
                EvidenceRefs(supply));

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            if (rows[rowIndex] is not JsonObject row)
                continue;
            var size = row["size"] as JsonObject;
            var sizeResolution = size?["resolution"]?.GetValue<string>() ?? "Missing";
            if (sizeResolution == "Missing")
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    "SIZE_MISSING",
                    "MissingRequired",
                    true,
                    [$"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/size"],
                    "Size is required.",
                    [],
                    EvidenceRefs(size));
            else if (sizeResolution == "Ambiguous")
                AddConfirmationIssue(
                    issues,
                    "SIZE_UNCERTAIN",
                    $"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/size",
                    "Size is ambiguous and must not be silently selected.",
                    size);
            else if (sizeResolution == "Custom")
                AddConfirmationIssue(
                    issues,
                    "CUSTOM_SIZE_CONFIRMATION_REQUIRED",
                    $"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/size",
                    "Custom size requires confirmation.",
                    size);

            var quantity = row["quantity"] as JsonObject;
            var quantityValue = quantity?["value"];
            if (quantity?["presence"]?.GetValue<string>() == "missing")
            {
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    "QUANTITY_MISSING",
                    "MissingRequired",
                    true,
                    [$"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/quantity"],
                    "Quantity is required.",
                    [],
                    EvidenceRefs(quantity));
            }
            else if (quantityValue is null)
            {
                var rule = quantity?["normalization"]?["rule"]?.GetValue<string>();
                var original = quantity?["normalization"]?["originalValue"]?.ToString();
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    "QUANTITY_MULTIPLE_VALUES",
                    "Conflict",
                    true,
                    [$"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/quantity"],
                    rule switch
                    {
                        "not-positive" => "Quantity must be a positive integer.",
                        "above-maximum" => $"Quantity must not exceed {OrderLimits.MaxOrderItemQuantity}.",
                        _ => "Quantity must be a whole integer.",
                    },
                    original is null ? [] : [original],
                    EvidenceRefs(quantity));
            }
            else if (!AiOrderTextNormalization.TryNormalizeQuantity(
                         quantityValue,
                         out var parsed,
                         out var error))
            {
                AiOrderFinancialValidator.AddIssue(
                    issues,
                    "QUANTITY_MULTIPLE_VALUES",
                    "Conflict",
                    true,
                    [$"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/quantity"],
                    error switch
                    {
                        "not-positive" => "Quantity must be a positive integer.",
                        "above-maximum" => $"Quantity must not exceed {OrderLimits.MaxOrderItemQuantity}.",
                        _ => "Quantity must be a whole integer.",
                    },
                    [parsed?.ToString(CultureInfo.InvariantCulture) ?? quantityValue.ToJsonString()],
                    EvidenceRefs(quantity));
            }
            AiOrderFinancialValidator.AddLowConfidence(
                size,
                $"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/size",
                true,
                issues,
                _options.RequiredFieldConfidenceThreshold);
            AiOrderFinancialValidator.AddLowConfidence(
                quantity,
                $"/productGroups/{groupIndex}/sizeQuantityRows/{rowIndex}/quantity",
                true,
                issues,
                _options.RequiredFieldConfidenceThreshold);
        }
    }

    private JsonObject NormalizeColour(
        JsonObject? source,
        IReadOnlyCollection<string> vocabulary)
    {
        var original = StringValue(source);
        var text = AiOrderTextNormalization.NormalizeText(original);
        var key = AiOrderTextNormalization.NormalizeComparison(text);
        var presence = source?["presence"]?.GetValue<string>() ?? "missing";
        string resolution;
        string? label = null;
        string kind = "Named";
        string rule;
        var confirmation = false;
        if (presence == "missing" || text is null)
        {
            resolution = "Missing";
            rule = "missing";
        }
        else if (key is "NOT APPLICABLE" or "N A" or "NA")
        {
            resolution = "NotApplicable";
            label = "Not Applicable";
            kind = "NotApplicable";
            rule = "controlled-not-applicable-v1";
            confirmation = true;
        }
        else
        {
            var exact = vocabulary.Where(x => x == text).Distinct().ToArray();
            var normalized = vocabulary
                .Where(x => AiOrderTextNormalization.NormalizeComparison(x) == key)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            var aliasTarget = _options.ColourAliases
                .FirstOrDefault(x =>
                    AiOrderTextNormalization.NormalizeComparison(x.Key) == key).Value;
            var aliasMatches = string.IsNullOrWhiteSpace(aliasTarget)
                ? []
                : vocabulary
                    .Where(x => AiOrderTextNormalization.NormalizeComparison(x) ==
                                AiOrderTextNormalization.NormalizeComparison(aliasTarget))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
            if (exact.Length == 1)
            {
                resolution = "ExactCatalogueValue";
                label = exact[0];
                rule = "catalogue-colour-exact-v1";
            }
            else if (normalized.Length == 1)
            {
                resolution = "NormalizedCatalogueValue";
                label = normalized[0];
                rule = "catalogue-colour-normalized-v1";
            }
            else if (aliasMatches.Length == 1)
            {
                resolution = "ApprovedAlias";
                label = aliasMatches[0];
                rule = $"approved-colour-alias:{key}";
            }
            else if (normalized.Length > 1 || aliasMatches.Length > 1)
            {
                resolution = "Ambiguous";
                label = text;
                rule = "catalogue-colour-ambiguous-v1";
                confirmation = true;
            }
            else
            {
                resolution = "Custom";
                label = text;
                rule = "custom-colour-preserved-v1";
                confirmation = true;
            }
        }
        var evidence = AiOrderFinancialValidator.Evidence(
            source,
            label is null
                ? null
                : new JsonObject
                {
                    ["kind"] = kind,
                    ["label"] = label,
                },
            original,
            rule,
            confirmation || presence == "inferred");
        evidence["resolution"] = resolution;
        return evidence;
    }

    private List<JsonObject> NormalizeSizeRows(
        JsonArray rows,
        IReadOnlyCollection<string> vocabulary)
    {
        var result = new List<JsonObject>();
        for (var index = 0; index < rows.Count; index++)
        {
            if (rows[index] is not JsonObject row)
                continue;
            var size = NormalizeSize(row["size"] as JsonObject, vocabulary);
            var quantitySource = row["quantity"] as JsonObject;
            var quantityOriginal = quantitySource?["value"]?.ToJsonString();
            AiOrderTextNormalization.TryNormalizeQuantity(
                quantitySource?["value"],
                out var quantity,
                out var error);
            var quantityEvidence = AiOrderFinancialValidator.Evidence(
                quantitySource,
                error is null && quantity.HasValue ? JsonValue.Create(quantity.Value) : null,
                quantityOriginal,
                error is null ? "positive-integer-v1" : error ?? "missing",
                error is not null || quantitySource?["presence"]?.GetValue<string>() == "inferred");
            result.Add(new JsonObject
            {
                ["sourceRowIdentity"] = $"{index}:{AiOrderTextNormalization.Sha256(row.ToJsonString())[..12]}",
                ["size"] = size,
                ["quantity"] = quantityEvidence,
                ["sourceText"] = row["sourceText"]?.DeepClone(),
                ["warnings"] = row["warnings"]?.DeepClone() ?? new JsonArray(),
            });
        }
        if (result.Count == 0)
        {
            result.Add(new JsonObject
            {
                ["sourceRowIdentity"] = "missing-row",
                ["size"] = NormalizeSize(null, vocabulary),
                ["quantity"] = AiOrderFinancialValidator.Evidence(
                    null,
                    null,
                    null,
                    "missing",
                    true),
                ["sourceText"] = null,
                ["warnings"] = new JsonArray(),
            });
        }
        return result;
    }

    private JsonObject NormalizeSize(
        JsonObject? source,
        IReadOnlyCollection<string> vocabulary)
    {
        var original = StringValue(source);
        var text = AiOrderTextNormalization.NormalizeText(original);
        var key = AiOrderTextNormalization.NormalizeComparison(text);
        var presence = source?["presence"]?.GetValue<string>() ?? "missing";
        string resolution;
        string? label = null;
        string kind = "Catalogue";
        string rule;
        var confirmation = false;
        if (presence == "missing" || text is null)
        {
            resolution = "Missing";
            rule = "missing";
        }
        else if (IsAmbiguousSize(text))
        {
            resolution = "Ambiguous";
            label = text;
            kind = "Custom";
            rule = "ambiguous-size-preserved-v1";
            confirmation = true;
        }
        else
        {
            var aliases = _options.SizeAliases
                .Where(x => AiOrderTextNormalization.NormalizeComparison(x.Key) == key)
                .Select(x => x.Value)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var candidateText = aliases.Length == 1 ? aliases[0] : text;
            var candidateKey = AiOrderTextNormalization.NormalizeComparison(candidateText);
            var matches = vocabulary
                .Where(x => AiOrderTextNormalization.NormalizeComparison(x) == candidateKey)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            if (candidateKey == "ONE SIZE")
            {
                resolution = "OneSize";
                label = "One Size";
                kind = "OneSize";
                rule = aliases.Length == 1 ? $"approved-size-alias:{key}" : "controlled-one-size-v1";
            }
            else if (matches.Length == 1)
            {
                resolution = aliases.Length == 1
                    ? "ApprovedAlias"
                    : matches[0] == text ? "ExactCatalogueValue" : "NormalizedCatalogueValue";
                label = matches[0];
                rule = aliases.Length == 1
                    ? $"approved-size-alias:{key}"
                    : "catalogue-size-normalized-v1";
            }
            else if (matches.Length > 1 || aliases.Length > 1)
            {
                resolution = "Ambiguous";
                label = text;
                kind = "Custom";
                rule = "catalogue-size-ambiguous-v1";
                confirmation = true;
            }
            else
            {
                resolution = "Custom";
                label = text;
                kind = "Custom";
                rule = "custom-size-preserved-v1";
                confirmation = true;
            }
        }
        var evidence = AiOrderFinancialValidator.Evidence(
            source,
            label is null
                ? null
                : new JsonObject
                {
                    ["kind"] = kind,
                    ["label"] = label,
                },
            original,
            rule,
            confirmation || presence == "inferred");
        evidence["resolution"] = resolution;
        return evidence;
    }

    private static List<JsonObject> NormalizePrinting(JsonArray printing)
    {
        return printing
            .OfType<JsonObject>()
            .Select(x => new JsonObject
            {
                ["position"] = NormalizeStringEvidence(x["position"] as JsonObject, "text-nfkc-v1"),
                ["printSize"] = NormalizeStringEvidence(x["printSize"] as JsonObject, "text-nfkc-v1"),
                ["notes"] = NormalizeStringEvidence(x["notes"] as JsonObject, "text-nfkc-v1"),
            })
            .OrderBy(x => x.ToJsonString(), StringComparer.Ordinal)
            .ToList();
    }

    private static JsonObject NormalizeStringEvidence(JsonObject? source, string rule)
    {
        var original = StringValue(source);
        var normalized = AiOrderTextNormalization.NormalizeText(original);
        return AiOrderFinancialValidator.Evidence(
            source,
            original is null ? null : JsonValue.Create(normalized),
            original,
            rule,
            source?["presence"]?.GetValue<string>() == "inferred");
    }

    private static JsonObject NormalizeSupplySource(JsonObject? source)
    {
        var original = StringValue(source);
        var key = AiOrderTextNormalization.NormalizeComparison(original);
        var normalized = key switch
        {
            null => "Unknown",
            "CUSTOMER" or "CUSTOMER SUPPLIED" or "CUSTOMER SUPPLY" => "Customer",
            "SHOP" or "SHOP SUPPLIED" or "STORE" or "TEE NOVA" or "TEENOVA" => "Shop",
            "UNKNOWN" => "Unknown",
            _ => "Unknown",
        };
        var requiresConfirmation =
            source?["presence"]?.GetValue<string>() == "inferred" ||
            normalized == "Unknown";
        return AiOrderFinancialValidator.Evidence(
            source,
            JsonValue.Create(normalized),
            original,
            "controlled-supply-source-v1",
            requiresConfirmation);
    }

    private static string? StringValue(JsonObject? evidence) =>
        evidence?["value"] is JsonValue value &&
        value.TryGetValue<string>(out var text)
            ? text
            : null;

    private static bool IsAmbiguousSize(string value)
    {
        var normalized = AiOrderTextNormalization.NormalizeText(value) ?? string.Empty;
        return normalized.Contains('/') ||
               normalized.Contains(" or ", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains(" OR ", StringComparison.Ordinal);
    }

    private static void AddProductUnresolved(
        IList<JsonObject> issues,
        int groupIndex,
        string productName,
        JsonObject fragment)
    {
        AiOrderFinancialValidator.AddIssue(
            issues,
            "PRODUCT_UNRESOLVED",
            "MissingRequired",
            true,
            [$"/productGroups/{groupIndex}/productResolution"],
            "Product remains unresolved until staff confirms a catalogue product or ad-hoc snapshot.",
            [productName],
            EvidenceRefs(fragment["writtenProductDescription"] as JsonObject));
    }

    private static void AddQuantitySumConflictIfPresent(
        IReadOnlyCollection<JsonObject> fragments,
        JsonArray rows,
        IList<JsonObject> issues,
        int groupIndex)
    {
        var writtenTotals = fragments
            .SelectMany(fragment =>
                (fragment["sourceAlternatives"] as JsonArray ?? []).OfType<JsonObject>())
            .Where(alternative =>
            {
                var field = alternative["field"]?.GetValue<string>() ?? string.Empty;
                return field.Contains("quantity", StringComparison.OrdinalIgnoreCase) &&
                       field.Contains("total", StringComparison.OrdinalIgnoreCase);
            })
            .Select(alternative =>
            {
                var value = alternative["value"];
                if (value is JsonValue json && json.TryGetValue<int>(out var integer))
                    return (int?)integer;
                return int.TryParse(value?.ToString(), out integer)
                    ? integer
                    : null;
            })
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .Distinct()
            .ToArray();
        if (writtenTotals.Length == 0)
            return;
        var rowTotal = rows
            .OfType<JsonObject>()
            .Select(row => row["proposedCombinedQuantity"]?.GetValue<int?>())
            .Where(x => x.HasValue)
            .Sum(x => x!.Value);
        if (writtenTotals.All(x => x == rowTotal))
            return;
        AiOrderFinancialValidator.AddIssue(
            issues,
            "QUANTITY_SUM_MISMATCH",
            "Conflict",
            true,
            [$"/productGroups/{groupIndex}/sizeQuantityRows"],
            "Written group quantity does not equal the normalized size-row sum.",
            writtenTotals.Append(rowTotal).Select(
                x => x.ToString(CultureInfo.InvariantCulture)),
            []);
    }

    private static void AddCustomerWarning(
        IList<JsonObject> issues,
        string code,
        string path,
        string message,
        JsonObject evidence)
    {
        AiOrderFinancialValidator.AddIssue(
            issues,
            code,
            "NeedsConfirmation",
            false,
            [path],
            message,
            [],
            EvidenceRefs(evidence));
    }

    private static void AddConfirmationIssue(
        IList<JsonObject> issues,
        string code,
        string path,
        string message,
        JsonObject? evidence)
    {
        AiOrderFinancialValidator.AddIssue(
            issues,
            code,
            "NeedsConfirmation",
            true,
            [path],
            message,
            evidence?["normalization"]?["originalValue"] is JsonValue value
                ? [value.ToString()]
                : [],
            EvidenceRefs(evidence));
    }

    private static void AddCatalogueIssue(
        IList<JsonObject> issues,
        string code,
        string path,
        string message,
        string observed,
        bool blocking)
    {
        AiOrderFinancialValidator.AddIssue(
            issues,
            code,
            code == "CATALOGUE_SELECTION_STALE" ? "Conflict" : "NeedsConfirmation",
            blocking,
            [path],
            message,
            [observed],
            []);
    }

    private static JsonArray EvidenceRefs(JsonObject? evidence) =>
        AiOrderFinancialValidator.CloneArray(evidence?["sourceRefs"]);

    private static JsonArray MergeRowRefs(IEnumerable<JsonObject> rows)
    {
        var refs = rows
            .SelectMany(row =>
                (row["size"]?["sourceRefs"] as JsonArray ?? [])
                .Concat(row["quantity"]?["sourceRefs"] as JsonArray ?? []))
            .Select(x => x?.DeepClone())
            .ToArray();
        return new JsonArray(refs);
    }
}
