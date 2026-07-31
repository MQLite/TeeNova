using System.Globalization;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.Json.Nodes;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Validation;

public static class AiOrderStaffReviewVersions
{
    public const string Review = "ai-order-staff-review-v1";
    public const int MaximumGroups = 100;
    public const int MaximumRows = 500;
    public const int MaximumPrintingRows = 100;
    public const int MaximumIssueResolutions = 500;
    public const int MaximumOperations = 200;
}

public sealed record AiOrderStaffReviewBuildResult(
    JsonObject Document,
    string CanonicalJson,
    string CanonicalSha256,
    IReadOnlyList<AiOrderReviewEventInput> Events,
    int IssueCount,
    int BlockingIssueCount,
    int WarningCount,
    bool ReadyToConfirm);

public sealed class AiOrderStaffReviewEngine : ITransientDependency
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    public JsonObject BuildInitialDocument(
        Guid importId,
        int baseRevision,
        int validationRevision,
        Guid validationRevisionId,
        string validationCanonicalSha256,
        JsonObject validation)
    {
        var customer = validation["customer"] as JsonObject ?? new JsonObject();
        var groups = validation["productGroups"] as JsonArray ?? [];
        var financials = validation["financials"] as JsonObject ?? new JsonObject();
        var issues = validation["issues"] as JsonArray ?? [];

        var reviewGroups = new JsonArray();
        for (var groupIndex = 0; groupIndex < groups.Count; groupIndex++)
        {
            if (groups[groupIndex] is not JsonObject group)
                continue;
            var groupId = SafeId(
                group["groupId"]?.GetValue<string>(),
                $"group-{groupIndex + 1}");
            var printing = new JsonArray();
            var sourcePrinting = group["printing"] as JsonArray ?? [];
            for (var printIndex = 0; printIndex < sourcePrinting.Count; printIndex++)
            {
                if (sourcePrinting[printIndex] is not JsonObject print)
                    continue;
                printing.Add(new JsonObject
                {
                    ["printId"] = StableId(groupId, "print", printIndex),
                    ["position"] = InitialField(print["position"] as JsonObject),
                    ["printSize"] = InitialField(print["printSize"] as JsonObject),
                    ["notes"] = InitialField(print["notes"] as JsonObject),
                });
            }

            var rows = new JsonArray();
            var sourceRows = group["sizeQuantityRows"] as JsonArray ?? [];
            for (var rowIndex = 0; rowIndex < sourceRows.Count; rowIndex++)
            {
                if (sourceRows[rowIndex] is not JsonObject row)
                    continue;
                rows.Add(new JsonObject
                {
                    ["rowId"] = StableId(groupId, "row", rowIndex),
                    ["size"] = InitialField(row["size"] as JsonObject),
                    ["quantity"] = InitialField(row["quantity"] as JsonObject),
                    ["confirmedProductVariantId"] = null,
                    ["variantCandidatesByProduct"] =
                        row["variantCandidatesByProduct"]?.DeepClone() ?? new JsonArray(),
                    ["compatibleVariants"] = new JsonArray(),
                    ["sourceEvidence"] = row["sourceEvidence"]?.DeepClone() ?? new JsonArray(),
                });
            }

            var resolution = group["productResolution"] as JsonObject ?? new JsonObject();
            reviewGroups.Add(new JsonObject
            {
                ["groupId"] = groupId,
                ["writtenProductName"] =
                    InitialField(group["writtenProductDescription"] as JsonObject),
                ["productSelection"] = new JsonObject
                {
                    ["mode"] = "Unresolved",
                    ["selectedCatalogueProduct"] = null,
                    ["adHocProduct"] = BuildInitialAdHoc(
                        resolution["adHocProposal"] as JsonObject,
                        groupId),
                    ["productCandidates"] =
                        resolution["productCandidates"]?.DeepClone() ?? new JsonArray(),
                    ["reason"] = null,
                },
                ["colour"] = InitialField(group["colour"] as JsonObject),
                ["supplySource"] = InitialField(group["supplySource"] as JsonObject),
                ["artworkIdentity"] = InitialField(group["artworkIdentity"] as JsonObject),
                ["artworkDescription"] = InitialField(group["artworkDescription"] as JsonObject),
                ["productionNotes"] = EmptyField(),
                ["printing"] = printing,
                ["sizeQuantityRows"] = rows,
                ["sourceEvidence"] = group["sourceEvidence"]?.DeepClone() ?? new JsonArray(),
                ["groupingEvidence"] = new JsonObject
                {
                    ["groupingKeySha256"] = group["groupingKeySha256"]?.DeepClone(),
                    ["groupingKeyVersion"] = group["groupingKeyVersion"]?.DeepClone(),
                },
            });
        }

        var reviewIssues = new JsonArray(issues
            .OfType<JsonObject>()
            .Select(issue => (JsonNode)CloneIssueWithOpenResolution(issue))
            .ToArray());
        var blocking = reviewIssues.OfType<JsonObject>()
            .Count(IsOpenBlocking);
        var warnings = reviewIssues.OfType<JsonObject>()
            .Count(IsOpenWarning);

        return new JsonObject
        {
            ["reviewVersion"] = AiOrderStaffReviewVersions.Review,
            ["importId"] = importId,
            ["sourceValidationRevision"] = new JsonObject
            {
                ["id"] = validationRevisionId,
                ["revision"] = validationRevision,
                ["canonicalSha256"] = validationCanonicalSha256,
            },
            ["baseRevision"] = baseRevision,
            ["revision"] = null,
            ["customer"] = new JsonObject
            {
                ["name"] = InitialField(customer["name"] as JsonObject),
                ["phone"] = InitialField(customer["phone"] as JsonObject),
                ["email"] = InitialField(customer["email"] as JsonObject),
                ["organisation"] = InitialField(customer["organisation"] as JsonObject),
                ["addressOrFulfilmentNotes"] =
                    InitialField(customer["addressOrFulfilmentNotes"] as JsonObject),
            },
            ["productGroups"] = reviewGroups,
            ["financials"] = new JsonObject
            {
                ["orderTotal"] = InitialMoneyField(
                    financials["orderTotal"] as JsonObject),
                ["depositPaid"] = InitialMoneyField(
                    financials["depositPaid"] as JsonObject),
                ["writtenBalance"] = financials["writtenBalance"]?.DeepClone(),
                ["balanceDue"] = financials["balanceDue"]?.DeepClone(),
                ["derivationStatus"] =
                    financials["derivationStatus"]?.DeepClone() ?? "Incomplete",
                ["catalogueQuote"] = new JsonObject
                {
                    ["status"] = "Unavailable",
                    ["amount"] = null,
                    ["reason"] =
                        "Jira 10206 preserves the written total and does not invent a catalogue quote.",
                },
            },
            ["issues"] = reviewIssues,
            ["issueResolutions"] = new JsonArray(),
            ["issueCount"] = reviewIssues.Count,
            ["blockingIssueCount"] = blocking,
            ["warningCount"] = warnings,
            ["confirmationReadiness"] = Readiness(
                false,
                blocking,
                "Save a Staff Draft and complete all blocking items before confirmation."),
            ["catalogueFingerprint"] = validation["catalogueFingerprint"]?.DeepClone(),
            ["catalogueValidatedAt"] = validation["catalogueValidatedAt"]?.DeepClone(),
            ["editorMetadata"] = null,
        };
    }

    public AiOrderStaffReviewBuildResult BuildReviewedDocument(
        Guid importId,
        int expectedRevision,
        int validationRevision,
        Guid validationRevisionId,
        string validationSha256,
        JsonObject previous,
        SaveAiOrderReviewInput input,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        Guid actorAdminId,
        DateTime recordedAt)
    {
        EnsureInputBounds(input);
        RequireQuantityConflictReasons(previous, input);
        if (!string.Equals(
                input.ReviewVersion,
                AiOrderStaffReviewVersions.Review,
                StringComparison.Ordinal))
        {
            throw Safe(
                AiOrderImportErrorCodes.ReviewVersionUnsupported,
                $"Review version must be {AiOrderStaffReviewVersions.Review}.");
        }

        var previousGroups = (previous["productGroups"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToDictionary(
                x => x["groupId"]?.GetValue<string>() ?? string.Empty,
                StringComparer.Ordinal);
        var groupIds = new HashSet<string>(StringComparer.Ordinal);
        var totalRows = 0;
        var groups = new JsonArray();
        for (var groupIndex = 0; groupIndex < input.ProductGroups.Count; groupIndex++)
        {
            var submitted = input.ProductGroups[groupIndex];
            var groupId = EnsureClientId(
                submitted.GroupId,
                $"productGroups[{groupIndex}].groupId");
            if (!groupIds.Add(groupId))
                Invalid("Product group identifiers must be unique.");
            previousGroups.TryGetValue(groupId, out var prior);
            var built = BuildGroup(
                submitted,
                prior,
                catalogue,
                groupIndex,
                ref totalRows);
            groups.Add(built);
        }
        if (totalRows > AiOrderStaffReviewVersions.MaximumRows)
            Invalid($"A review may contain at most {AiOrderStaffReviewVersions.MaximumRows} size rows.");

        var customerPrior = previous["customer"] as JsonObject;
        var customer = new JsonObject
        {
            ["name"] = EditedTextField(
                customerPrior?["name"] as JsonObject,
                input.Customer.Name,
                "/customer/name"),
            ["phone"] = EditedTextField(
                customerPrior?["phone"] as JsonObject,
                input.Customer.Phone,
                "/customer/phone"),
            ["email"] = EditedTextField(
                customerPrior?["email"] as JsonObject,
                input.Customer.Email,
                "/customer/email"),
            ["organisation"] = EditedTextField(
                customerPrior?["organisation"] as JsonObject,
                input.Customer.Organisation,
                "/customer/organisation"),
            ["addressOrFulfilmentNotes"] = EditedTextField(
                customerPrior?["addressOrFulfilmentNotes"] as JsonObject,
                input.Customer.AddressOrFulfilmentNotes,
                "/customer/addressOrFulfilmentNotes"),
        };

        var priorFinancials = previous["financials"] as JsonObject;
        RequireFinancialConflictReasons(previous, input.Financials);
        var orderTotal = EditedMoneyField(
            priorFinancials?["orderTotal"] as JsonObject,
            input.Financials.OrderTotal,
            "/financials/orderTotal");
        var depositPaid = EditedMoneyField(
            priorFinancials?["depositPaid"] as JsonObject,
            input.Financials.DepositPaid,
            "/financials/depositPaid");
        var total = MoneyAmount(orderTotal);
        var deposit = MoneyAmount(depositPaid);
        JsonObject? balance = null;
        var derivation = "Incomplete";
        if (total.HasValue && deposit.HasValue)
        {
            if (deposit.Value <= total.Value)
            {
                balance = Money(total.Value - deposit.Value);
                derivation = "Complete";
            }
            else
            {
                derivation = "Invalid";
            }
        }
        var financials = new JsonObject
        {
            ["orderTotal"] = orderTotal,
            ["depositPaid"] = depositPaid,
            ["writtenBalance"] = priorFinancials?["writtenBalance"]?.DeepClone(),
            ["balanceDue"] = balance,
            ["derivationStatus"] = derivation,
            ["catalogueQuote"] = new JsonObject
            {
                ["status"] = "Unavailable",
                ["amount"] = null,
                ["reason"] =
                    "Jira 10206 preserves the written total and does not invent a catalogue quote.",
            },
        };

        var generatedIssues = GenerateIssues(customer, groups, financials);
        var issues = MergeIssueHistory(
            previous["issues"] as JsonArray ?? [],
            generatedIssues,
            input.IssueResolutions);
        var openBlocking = issues.OfType<JsonObject>().Count(IsOpenBlocking);
        var openWarnings = issues.OfType<JsonObject>().Count(IsOpenWarning);
        var ready = groups.Count > 0 && openBlocking == 0;
        var fingerprint = AiOrderExtractionNormalizer.CreateCatalogueFingerprint(catalogue);
        var document = new JsonObject
        {
            ["reviewVersion"] = AiOrderStaffReviewVersions.Review,
            ["importId"] = importId,
            ["sourceValidationRevision"] = new JsonObject
            {
                ["id"] = validationRevisionId,
                ["revision"] = validationRevision,
                ["canonicalSha256"] = validationSha256,
            },
            ["baseRevision"] = expectedRevision,
            ["revision"] = expectedRevision + 1,
            ["customer"] = customer,
            ["productGroups"] = groups,
            ["financials"] = financials,
            ["issues"] = issues,
            ["issueResolutions"] = BuildResolutionEvidence(input.IssueResolutions),
            ["issueCount"] = issues.Count,
            ["blockingIssueCount"] = openBlocking,
            ["warningCount"] = openWarnings,
            ["confirmationReadiness"] = Readiness(
                ready,
                openBlocking,
                ready
                    ? "All required information is complete. Formal confirmation will be enabled in Jira 10207."
                    : $"Complete {openBlocking} required item{(openBlocking == 1 ? string.Empty : "s")} before confirmation."),
            ["catalogueFingerprint"] = fingerprint,
            ["catalogueValidatedAt"] = recordedAt.ToUniversalTime()
                .ToString("O", CultureInfo.InvariantCulture),
            ["editorMetadata"] = new JsonObject
            {
                ["lastEditedByAdminId"] = actorAdminId,
                ["lastEditedAt"] = recordedAt.ToUniversalTime()
                    .ToString("O", CultureInfo.InvariantCulture),
            },
        };

        ValidateOperationSemantics(previous, document, input.Operations);
        var canonicalJson = document.ToJsonString(JsonOptions);
        var events = BuildEvents(previous, document, input.Operations);
        return new AiOrderStaffReviewBuildResult(
            document,
            canonicalJson,
            AiOrderTextNormalization.Sha256(canonicalJson),
            events,
            issues.Count,
            openBlocking,
            openWarnings,
            ready);
    }

    private JsonObject BuildGroup(
        AiOrderReviewProductGroupInput input,
        JsonObject? prior,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        int groupIndex,
        ref int totalRows)
    {
        if (input.SizeQuantityRows.Count > AiOrderStaffReviewVersions.MaximumRows)
            Invalid("A product group contains too many size rows.");
        if (input.Printing.Count > AiOrderStaffReviewVersions.MaximumPrintingRows)
            Invalid("A product group contains too many print rows.");
        totalRows += input.SizeQuantityRows.Count;
        var basePath = $"/productGroups/{groupIndex}";

        var colour = EditedControlledField(
            prior?["colour"] as JsonObject,
            input.Colour,
            $"{basePath}/colour",
            ["Named", "NotApplicable"]);
        var selection = BuildProductSelection(
            input.ProductSelection,
            prior?["productSelection"] as JsonObject,
            input.GroupId,
            colour,
            catalogue,
            basePath);

        var priorRows = (prior?["sizeQuantityRows"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToDictionary(
                x => x["rowId"]?.GetValue<string>() ?? string.Empty,
                StringComparer.Ordinal);
        var rowIds = new HashSet<string>(StringComparer.Ordinal);
        var rows = new List<JsonObject>();
        foreach (var (rowInput, rowIndex) in input.SizeQuantityRows.Select((x, i) => (x, i)))
        {
            var rowId = EnsureClientId(
                rowInput.RowId,
                $"{basePath}/sizeQuantityRows/{rowIndex}/rowId");
            if (!rowIds.Add(rowId))
                Invalid("Size-row identifiers must be unique within a product group.");
            priorRows.TryGetValue(rowId, out var priorRow);
            var size = EditedControlledField(
                priorRow?["size"] as JsonObject,
                rowInput.Size,
                $"{basePath}/sizeQuantityRows/{rowIndex}/size",
                ["Catalogue", "OneSize", "Custom"]);
            if (rowInput.Quantity is <= 0 or > OrderLimits.MaxOrderItemQuantity)
                Invalid($"Quantity must be from 1 through {OrderLimits.MaxOrderItemQuantity}.");
            RequireReasonForSensitiveField(
                priorRow?["quantity"] as JsonObject,
                rowInput.Quantity is null ? null : JsonValue.Create(rowInput.Quantity.Value),
                rowInput.QuantityDecision,
                rowInput.QuantityReason,
                $"{basePath}/sizeQuantityRows/{rowIndex}/quantity");

            var row = new JsonObject
            {
                ["rowId"] = rowId,
                ["size"] = size,
                ["quantity"] = EditedField(
                    priorRow?["quantity"] as JsonObject,
                    rowInput.Quantity is null ? null : JsonValue.Create(rowInput.Quantity.Value),
                    NormalizeDecision(rowInput.QuantityDecision),
                    BoundedOptional(rowInput.QuantityReason, 1000, "quantity reason")),
                ["confirmedProductVariantId"] = rowInput.ConfirmedProductVariantId,
                ["variantCandidatesByProduct"] =
                    priorRow?["variantCandidatesByProduct"]?.DeepClone() ?? new JsonArray(),
                ["compatibleVariants"] = new JsonArray(),
                ["sourceEvidence"] =
                    priorRow?["sourceEvidence"]?.DeepClone() ?? new JsonArray(),
            };
            rows.Add(row);
        }

        ValidateAndEnrichVariants(selection, colour, rows, catalogue, basePath);
        rows = rows
            .OrderBy(RowSortKey, StringComparer.Ordinal)
            .ThenBy(x => x["rowId"]?.GetValue<string>(), StringComparer.Ordinal)
            .ToList();

        var printing = new JsonArray(input.Printing.Select((print, index) =>
        {
            var printId = EnsureClientId(
                print.PrintId,
                $"{basePath}/printing/{index}/printId");
            var priorPrint = (prior?["printing"] as JsonArray ?? [])
                .OfType<JsonObject>()
                .FirstOrDefault(x =>
                    x["printId"]?.GetValue<string>() == printId);
            return (JsonNode)new JsonObject
            {
                ["printId"] = printId,
                ["position"] = EditedTextField(
                    priorPrint?["position"] as JsonObject,
                    print.Position,
                    $"{basePath}/printing/{index}/position"),
                ["printSize"] = EditedTextField(
                    priorPrint?["printSize"] as JsonObject,
                    print.PrintSize,
                    $"{basePath}/printing/{index}/printSize"),
                ["notes"] = EditedTextField(
                    priorPrint?["notes"] as JsonObject,
                    print.Notes,
                    $"{basePath}/printing/{index}/notes"),
            };
        }).ToArray());

        var result = new JsonObject
        {
            ["groupId"] = input.GroupId,
            ["writtenProductName"] = EditedTextField(
                prior?["writtenProductName"] as JsonObject,
                input.WrittenProductName,
                $"{basePath}/writtenProductName"),
            ["productSelection"] = selection,
            ["colour"] = colour,
            ["supplySource"] = EditedTextField(
                prior?["supplySource"] as JsonObject,
                input.SupplySource,
                $"{basePath}/supplySource"),
            ["artworkIdentity"] = EditedTextField(
                prior?["artworkIdentity"] as JsonObject,
                input.ArtworkIdentity,
                $"{basePath}/artworkIdentity"),
            ["artworkDescription"] = EditedTextField(
                prior?["artworkDescription"] as JsonObject,
                input.ArtworkDescription,
                $"{basePath}/artworkDescription"),
            ["productionNotes"] = EditedTextField(
                prior?["productionNotes"] as JsonObject,
                input.ProductionNotes,
                $"{basePath}/productionNotes"),
            ["printing"] = printing,
            ["sizeQuantityRows"] = new JsonArray(rows.Select(x => (JsonNode)x).ToArray()),
            ["sourceEvidence"] = prior?["sourceEvidence"]?.DeepClone() ?? new JsonArray(),
            ["groupingEvidence"] = prior?["groupingEvidence"]?.DeepClone() ??
                                   new JsonObject
                                   {
                                       ["createdByStaff"] = true,
                                   },
        };
        result["groupingEvidence"]!["staffGroupingKeySha256"] =
            GroupCompatibilityKey(result);
        return result;
    }

    private JsonObject BuildProductSelection(
        AiOrderReviewProductSelectionInput input,
        JsonObject? prior,
        string groupId,
        JsonObject colour,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        string basePath)
    {
        var mode = input.Mode.Trim();
        var candidates = prior?["productCandidates"] as JsonArray ?? [];
        if (mode == "Unresolved")
        {
            if (input.CatalogueProductId.HasValue || input.AdHocProduct is not null)
                Invalid("Unresolved product selection cannot include a product choice.");
            return new JsonObject
            {
                ["mode"] = "Unresolved",
                ["selectedCatalogueProduct"] = null,
                ["adHocProduct"] = prior?["adHocProduct"]?.DeepClone(),
                ["productCandidates"] = candidates.DeepClone(),
                ["reason"] = BoundedOptional(input.Reason, 1000, "product selection reason"),
            };
        }

        if (mode == "Catalogue")
        {
            var productId = input.CatalogueProductId ??
                            throw Safe(
                                AiOrderImportErrorCodes.CatalogueSelectionInvalid,
                                "A catalogue product identifier is required.");
            var product = catalogue.SingleOrDefault(x => x.Id == productId);
            if (product is null || !product.IsActive)
                throw Safe(
                    AiOrderImportErrorCodes.CatalogueSelectionInvalid,
                    "The selected catalogue product does not exist or is inactive.");
            var ambiguous = candidates.Count > 1;
            if (ambiguous && string.IsNullOrWhiteSpace(input.Reason))
                ReasonRequired($"{basePath}/productSelection");
            return new JsonObject
            {
                ["mode"] = "Catalogue",
                ["selectedCatalogueProduct"] = new JsonObject
                {
                    ["productId"] = product.Id,
                    ["productName"] = product.Name,
                    ["productKind"] = product.Kind.ToString(),
                    ["pricingModel"] = product.PricingModel.ToString(),
                    ["active"] = product.IsActive,
                },
                ["adHocProduct"] = null,
                ["productCandidates"] = candidates.DeepClone(),
                ["reason"] = BoundedOptional(input.Reason, 1000, "product selection reason"),
            };
        }

        if (mode != "AdHoc")
            Invalid("Product selection mode must be Unresolved, Catalogue, or AdHoc.");
        if (input.AdHocProduct is null)
            Invalid("Ad-hoc product details are required.");
        var adHoc = input.AdHocProduct;
        var displayName = BoundedOptional(adHoc.DisplayName, 256, "ad-hoc display name");
        if (adHoc.Confirmed &&
            (string.IsNullOrWhiteSpace(displayName) || !adHoc.AcknowledgedOrderOnly))
        {
            throw Safe(
                AiOrderImportErrorCodes.CatalogueSelectionInvalid,
                "A confirmed ad-hoc product requires a display name and order-only acknowledgement.");
        }
        if (adHoc.Confirmed && string.IsNullOrWhiteSpace(adHoc.Reason))
            ReasonRequired($"{basePath}/productSelection/adHocProduct");
        return new JsonObject
        {
            ["mode"] = "AdHoc",
            ["selectedCatalogueProduct"] = null,
            ["adHocProduct"] = new JsonObject
            {
                ["adHocProductId"] =
                    prior?["adHocProduct"]?["adHocProductId"]?.DeepClone() ??
                    StableId(groupId, "ad-hoc", 0),
                ["displayName"] = displayName,
                ["brand"] = BoundedOptional(adHoc.Brand, 128, "ad-hoc brand"),
                ["supplierName"] =
                    BoundedOptional(adHoc.SupplierName, 256, "ad-hoc supplier"),
                ["supplierCode"] =
                    BoundedOptional(adHoc.SupplierCode, 128, "ad-hoc supplier code"),
                ["supplySource"] =
                    BoundedOptional(adHoc.SupplySource, 32, "ad-hoc supply source"),
                ["inventoryBehavior"] = "NotTracked",
                ["confirmed"] = adHoc.Confirmed,
                ["acknowledgedOrderOnly"] = adHoc.AcknowledgedOrderOnly,
                ["reason"] = BoundedOptional(adHoc.Reason, 1000, "ad-hoc reason"),
            },
            ["productCandidates"] = candidates.DeepClone(),
            ["reason"] = BoundedOptional(input.Reason, 1000, "product selection reason"),
        };
    }

    private static void ValidateAndEnrichVariants(
        JsonObject selection,
        JsonObject colour,
        IEnumerable<JsonObject> rows,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        string basePath)
    {
        var mode = selection["mode"]?.GetValue<string>();
        var colourKind = colour["staffValue"]?["kind"]?.GetValue<string>();
        var colourLabel = colour["staffValue"]?["label"]?.GetValue<string>();
        if (mode == "Catalogue")
        {
            var productId = selection["selectedCatalogueProduct"]!["productId"]!.GetValue<Guid>();
            var product = catalogue.Single(x => x.Id == productId);
            if (product.Kind == TeeNova.Catalog.ProductKind.Garment &&
                colourKind == "NotApplicable")
                Invalid("Catalogue garment colour cannot be Not Applicable.");
            foreach (var (row, index) in rows.Select((x, i) => (x, i)))
            {
                var sizeKind = row["size"]?["staffValue"]?["kind"]?.GetValue<string>();
                var sizeLabel = row["size"]?["staffValue"]?["label"]?.GetValue<string>();
                if (sizeKind == "Custom")
                    Invalid("Custom sizes are allowed only for ad-hoc products.");
                if (product.Kind != TeeNova.Catalog.ProductKind.Garment)
                {
                    if (row["confirmedProductVariantId"] is not null)
                        throw Safe(
                            AiOrderImportErrorCodes.VariantSelectionInvalid,
                            "This non-garment catalogue product does not use a variant.");
                    row["compatibleVariants"] = new JsonArray();
                    continue;
                }
                var compatible = product.Variants
                    .Where(x =>
                        x.IsAvailable &&
                        Same(x.Colour, colourLabel) &&
                        Same(x.Size, sizeLabel))
                    .OrderBy(x => x.Sku, StringComparer.Ordinal)
                    .Select(x => (JsonNode)new JsonObject
                    {
                        ["productVariantId"] = x.Id,
                        ["sku"] = x.Sku,
                        ["colour"] = x.Colour,
                        ["size"] = x.Size,
                        ["available"] = x.IsAvailable,
                    })
                    .ToArray();
                row["compatibleVariants"] = new JsonArray(compatible);
                if (row["confirmedProductVariantId"] is not JsonValue selected ||
                    !selected.TryGetValue<Guid>(out var variantId))
                    continue;
                var variant = product.Variants.SingleOrDefault(x => x.Id == variantId);
                if (variant is null || !variant.IsAvailable)
                    throw Safe(
                        AiOrderImportErrorCodes.VariantSelectionInvalid,
                        $"The variant selected for row {index + 1} does not belong to the active product.");
                if (!Same(variant.Colour, colourLabel) || !Same(variant.Size, sizeLabel))
                    throw Safe(
                        AiOrderImportErrorCodes.VariantSelectionInvalid,
                        $"The variant selected for row {index + 1} does not match its colour and size.");
            }
        }
        else
        {
            foreach (var row in rows)
            {
                if (row["confirmedProductVariantId"] is not null)
                    throw Safe(
                        AiOrderImportErrorCodes.VariantSelectionInvalid,
                        "Only catalogue products may have confirmed variants.");
                row["compatibleVariants"] = new JsonArray();
            }
        }
    }

    private static JsonArray GenerateIssues(
        JsonObject customer,
        JsonArray groups,
        JsonObject financials)
    {
        var issues = new List<JsonObject>();
        if (groups.Count == 0)
            AddIssue(
                issues,
                "PRODUCT_MISSING",
                "MissingRequired",
                true,
                ["/productGroups"],
                "At least one product group is required.");

        foreach (var (group, groupIndex) in groups.OfType<JsonObject>().Select((x, i) => (x, i)))
        {
            var groupPath = $"/productGroups/{groupIndex}";
            var selection = group["productSelection"] as JsonObject;
            var mode = selection?["mode"]?.GetValue<string>() ?? "Unresolved";
            if (mode == "Unresolved")
                AddIssue(
                    issues,
                    "PRODUCT_UNRESOLVED",
                    "MissingRequired",
                    true,
                    [$"{groupPath}/productSelection"],
                    "Select a catalogue product or confirm an ad-hoc product.");
            else if (mode == "AdHoc" &&
                     selection?["adHocProduct"]?["confirmed"]?.GetValue<bool>() != true)
            {
                AddIssue(
                    issues,
                    "AD_HOC_PRODUCT_CONFIRMATION_REQUIRED",
                    "NeedsConfirmation",
                    true,
                    [$"{groupPath}/productSelection/adHocProduct"],
                    "Confirm the ad-hoc product and acknowledge that it remains order-only.");
            }

            var colour = group["colour"]?["staffValue"];
            if (colour?["label"]?.GetValue<string>() is not { Length: > 0 })
                AddIssue(
                    issues,
                    "COLOUR_MISSING",
                    "MissingRequired",
                    true,
                    [$"{groupPath}/colour"],
                    "Colour is required or must be controlled Not Applicable.");
            else if (group["colour"]?["decision"]?.GetValue<string>() == "Unresolved")
            {
                var colourKind = colour["kind"]?.GetValue<string>();
                AddIssue(
                    issues,
                    colourKind == "NotApplicable"
                        ? "COLOUR_NOT_APPLICABLE_CONFIRMATION_REQUIRED"
                        : mode == "AdHoc" ? "COLOUR_CUSTOM" : "LOW_CONFIDENCE_REQUIRED_FIELD",
                    "NeedsConfirmation",
                    true,
                    [$"{groupPath}/colour"],
                    colourKind == "NotApplicable"
                        ? "Confirm the controlled Not Applicable colour."
                        : mode == "AdHoc"
                            ? "Confirm the custom ad-hoc colour."
                            : "Confirm the required colour value.");
            }

            var rows = group["sizeQuantityRows"] as JsonArray ?? [];
            if (rows.Count == 0)
                AddIssue(
                    issues,
                    "SIZE_MISSING",
                    "MissingRequired",
                    true,
                    [$"{groupPath}/sizeQuantityRows"],
                    "At least one size and quantity row is required.");
            var seenSizes = new HashSet<string>(StringComparer.Ordinal);
            foreach (var (row, rowIndex) in rows.OfType<JsonObject>().Select((x, i) => (x, i)))
            {
                var rowPath = $"{groupPath}/sizeQuantityRows/{rowIndex}";
                var size = row["size"]?["staffValue"];
                var label = size?["label"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(label))
                    AddIssue(
                        issues,
                        "SIZE_MISSING",
                        "MissingRequired",
                        true,
                        [$"{rowPath}/size"],
                        "Size is required.");
                else
                {
                    var normalized = AiOrderTextNormalization.NormalizeComparison(label)!;
                    if (!seenSizes.Add(normalized))
                        AddIssue(
                            issues,
                            "DUPLICATE_SIZE_ROW_UNCERTAIN",
                            "Conflict",
                            true,
                            [$"{groupPath}/sizeQuantityRows"],
                            "Duplicate size rows must be explicitly merged.");
                    if (IsAmbiguousSize(label) &&
                        !(mode == "AdHoc" &&
                          row["size"]?["decision"]?.GetValue<string>() == "Confirmed"))
                        AddIssue(
                            issues,
                            "SIZE_UNCERTAIN",
                            "NeedsConfirmation",
                            true,
                            [$"{rowPath}/size"],
                            "Ambiguous sizes such as M/L must be resolved or deliberately confirmed as a custom ad-hoc size.");
                    else if (row["size"]?["decision"]?.GetValue<string>() == "Unresolved")
                        AddIssue(
                            issues,
                            size?["kind"]?.GetValue<string>() == "Custom"
                                ? "CUSTOM_SIZE_CONFIRMATION_REQUIRED"
                                : "LOW_CONFIDENCE_REQUIRED_FIELD",
                            "NeedsConfirmation",
                            true,
                            [$"{rowPath}/size"],
                            size?["kind"]?.GetValue<string>() == "Custom"
                                ? "Confirm the custom ad-hoc size."
                                : "Confirm the required size value.");
                }
                if (row["quantity"]?["staffValue"] is null)
                    AddIssue(
                        issues,
                        "QUANTITY_MISSING",
                        "MissingRequired",
                        true,
                        [$"{rowPath}/quantity"],
                        "Quantity is required.");
                else if (row["quantity"]?["decision"]?.GetValue<string>() == "Unresolved")
                    AddIssue(
                        issues,
                        "LOW_CONFIDENCE_REQUIRED_FIELD",
                        "NeedsConfirmation",
                        true,
                        [$"{rowPath}/quantity"],
                        "Confirm the required quantity value.");
                if (mode == "Catalogue" &&
                    group["productSelection"]?["selectedCatalogueProduct"]?["productKind"]?
                        .GetValue<string>() == "Garment" &&
                    row["confirmedProductVariantId"] is null)
                    AddIssue(
                        issues,
                        "VARIANT_NOT_FOUND",
                        "MissingRequired",
                        true,
                        [$"{rowPath}/confirmedProductVariantId"],
                        "Select the compatible catalogue variant for this size row.");
            }
        }

        if (financials["orderTotal"]?["staffValue"] is null)
            AddIssue(
                issues,
                "ORDER_TOTAL_MISSING",
                "MissingRequired",
                true,
                ["/financials/orderTotal"],
                "Order Total is required.");
        else if (financials["orderTotal"]?["decision"]?.GetValue<string>() == "Unresolved")
            AddIssue(
                issues,
                "LOW_CONFIDENCE_REQUIRED_FIELD",
                "NeedsConfirmation",
                true,
                ["/financials/orderTotal"],
                "Confirm the required Order Total.");
        if (financials["depositPaid"]?["staffValue"] is null)
            AddIssue(
                issues,
                "DEPOSIT_PAID_MISSING",
                "MissingRequired",
                true,
                ["/financials/depositPaid"],
                "Deposit Paid is required; explicit 0.00 is valid.");
        else if (financials["depositPaid"]?["decision"]?.GetValue<string>() == "Unresolved")
            AddIssue(
                issues,
                "LOW_CONFIDENCE_REQUIRED_FIELD",
                "NeedsConfirmation",
                true,
                ["/financials/depositPaid"],
                "Confirm the required Deposit Paid value.");
        var total = MoneyAmount(financials["orderTotal"] as JsonObject);
        var deposit = MoneyAmount(financials["depositPaid"] as JsonObject);
        if (total.HasValue && deposit.HasValue && deposit.Value > total.Value)
            AddIssue(
                issues,
                "DEPOSIT_EXCEEDS_TOTAL",
                "Conflict",
                true,
                ["/financials/depositPaid", "/financials/orderTotal"],
                "Deposit Paid must not exceed Order Total.");

        var email = customer["email"]?["staffValue"]?.GetValue<string>();
        if (!string.IsNullOrWhiteSpace(email) &&
            !email.Contains('@', StringComparison.Ordinal))
            AddIssue(
                issues,
                "CUSTOMER_EMAIL_INVALID",
                "NeedsConfirmation",
                false,
                ["/customer/email"],
                "Customer email syntax appears invalid.");
        var phone = customer["phone"]?["staffValue"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(phone))
            AddIssue(
                issues,
                "CUSTOMER_CONTACT_MISSING",
                "NeedsConfirmation",
                false,
                ["/customer"],
                "Customer phone and email are both missing.");
        return new JsonArray(issues
            .OrderBy(x => x["code"]?.GetValue<string>(), StringComparer.Ordinal)
            .ThenBy(x => x["paths"]?.ToJsonString(), StringComparer.Ordinal)
            .Select(x => (JsonNode)x)
            .ToArray());
    }

    private static JsonArray MergeIssueHistory(
        JsonArray previous,
        JsonArray generated,
        IReadOnlyList<AiOrderIssueResolutionInput> resolutions)
    {
        var resolutionMap = resolutions
            .Where(x => !string.IsNullOrWhiteSpace(x.IssueId))
            .GroupBy(x => x.IssueId, StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.Last(), StringComparer.Ordinal);
        var current = generated
            .OfType<JsonObject>()
            .ToDictionary(
                x => x["issueId"]!.GetValue<string>(),
                StringComparer.Ordinal);
        var result = new List<JsonObject>();
        foreach (var issue in current.Values)
        {
            var id = issue["issueId"]!.GetValue<string>();
            if (resolutionMap.TryGetValue(id, out var resolution) &&
                issue["severity"]?.GetValue<string>() == "Warning" &&
                string.Equals(
                    resolution.Decision,
                    "AcceptWarning",
                    StringComparison.Ordinal))
            {
                if (string.IsNullOrWhiteSpace(resolution.Reason))
                    ReasonRequired($"/issues/{id}");
                issue["resolution"] = new JsonObject
                {
                    ["status"] = "AcceptedWarning",
                    ["decision"] = "AcceptWarning",
                    ["reason"] = BoundedOptional(
                        resolution.Reason,
                        1000,
                        "issue-resolution reason"),
                };
            }
            result.Add(issue.DeepClone() as JsonObject ?? new JsonObject());
        }

        foreach (var old in previous.OfType<JsonObject>())
        {
            var id = old["issueId"]?.GetValue<string>();
            if (id is null || current.ContainsKey(id))
                continue;
            var resolved = old.DeepClone() as JsonObject ?? new JsonObject();
            var resolution = resolutionMap.GetValueOrDefault(id);
            resolved["resolution"] = new JsonObject
            {
                ["status"] = "Resolved",
                ["decision"] = resolution?.Decision ?? "UnderlyingDataCorrected",
                ["reason"] = BoundedOptional(
                    resolution?.Reason,
                    1000,
                    "issue-resolution reason"),
            };
            result.Add(resolved);
        }
        return new JsonArray(result
            .OrderBy(x => x["resolution"]?["status"]?.GetValue<string>(), StringComparer.Ordinal)
            .ThenBy(x => x["code"]?.GetValue<string>(), StringComparer.Ordinal)
            .Select(x => (JsonNode)x)
            .ToArray());
    }

    private static JsonArray BuildResolutionEvidence(
        IReadOnlyList<AiOrderIssueResolutionInput> resolutions) =>
        new(resolutions.Select(x => (JsonNode)new JsonObject
        {
            ["issueId"] = BoundedRequired(x.IssueId, 64, "issue resolution ID"),
            ["decision"] = BoundedRequired(x.Decision, 64, "issue resolution decision"),
            ["reason"] = BoundedOptional(x.Reason, 1000, "issue resolution reason"),
        }).ToArray());

    private static IReadOnlyList<AiOrderReviewEventInput> BuildEvents(
        JsonObject previous,
        JsonObject current,
        IReadOnlyList<AiOrderReviewOperationInput> operations)
    {
        var events = new List<AiOrderReviewEventInput>();
        var oldGroups = (previous["productGroups"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToDictionary(x => x["groupId"]!.GetValue<string>(), StringComparer.Ordinal);
        var newGroups = (current["productGroups"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToDictionary(x => x["groupId"]!.GetValue<string>(), StringComparer.Ordinal);
        foreach (var removed in oldGroups.Keys.Except(newGroups.Keys, StringComparer.Ordinal))
            events.Add(new(
                AiOrderReviewAction.GroupRemoved,
                $"/productGroups/{removed}",
                oldGroups[removed].ToJsonString(JsonOptions),
                null,
                FindOperationReason(operations, "GroupRemoved", removed)));
        foreach (var added in newGroups.Keys.Except(oldGroups.Keys, StringComparer.Ordinal))
            events.Add(new(
                AiOrderReviewAction.GroupAdded,
                $"/productGroups/{added}",
                null,
                newGroups[added].ToJsonString(JsonOptions),
                FindOperationReason(operations, "GroupAdded", added)));

        CollectFieldEvents(
            previous["customer"],
            current["customer"],
            "/customer",
            events);
        foreach (var id in oldGroups.Keys.Intersect(newGroups.Keys, StringComparer.Ordinal))
            CollectFieldEvents(
                oldGroups[id],
                newGroups[id],
                $"/productGroups/{id}",
                events);
        CollectFieldEvents(
            previous["financials"],
            current["financials"],
            "/financials",
            events);

        foreach (var operation in operations)
        {
            if (!TryOperationAction(operation.Action, out var action))
                Invalid($"Unsupported review operation '{operation.Action}'.");
            if (action is AiOrderReviewAction.GroupAdded or AiOrderReviewAction.GroupRemoved)
                continue;
            if (action is AiOrderReviewAction.GroupMerged or
                AiOrderReviewAction.GroupSplit or
                AiOrderReviewAction.RowMerged &&
                string.IsNullOrWhiteSpace(operation.Reason))
                ReasonRequired(operation.Path ?? "/productGroups");
            events.Add(new(
                action,
                BoundedOptional(operation.Path, 1024, "operation path"),
                JsonSerializer.Serialize(operation.SourceIds),
                JsonSerializer.Serialize(operation.ResultIds),
                BoundedOptional(operation.Reason, 1000, "operation reason")));
        }

        var previousIssues = previous["issues"] as JsonArray ?? [];
        var currentIssues = current["issues"] as JsonArray ?? [];
        foreach (var issue in currentIssues.OfType<JsonObject>())
        {
            var id = issue["issueId"]?.GetValue<string>();
            var status = issue["resolution"]?["status"]?.GetValue<string>();
            var priorStatus = previousIssues
                .OfType<JsonObject>()
                .FirstOrDefault(x => x["issueId"]?.GetValue<string>() == id)?
                ["resolution"]?["status"]?.GetValue<string>();
            if (id is not null &&
                status is "Resolved" or "AcceptedWarning" &&
                priorStatus != status)
            {
                events.Add(new(
                    AiOrderReviewAction.IssueResolved,
                    $"/issues/{id}",
                    priorStatus is null ? null : JsonSerializer.Serialize(priorStatus),
                    JsonSerializer.Serialize(status),
                    issue["resolution"]?["reason"]?.GetValue<string>()));
            }
        }
        events.Add(new(
            AiOrderReviewAction.DraftSaved,
            null,
            null,
            null,
            null));
        return events;
    }

    private static void ValidateOperationSemantics(
        JsonObject previous,
        JsonObject current,
        IReadOnlyList<AiOrderReviewOperationInput> operations)
    {
        var oldGroups = (previous["productGroups"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToDictionary(x => x["groupId"]!.GetValue<string>(), StringComparer.Ordinal);
        var newGroups = (current["productGroups"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .ToDictionary(x => x["groupId"]!.GetValue<string>(), StringComparer.Ordinal);
        foreach (var operation in operations)
        {
            if (operation.Action == "GroupMerged")
            {
                var sources = operation.SourceIds
                    .Where(oldGroups.ContainsKey)
                    .Select(id => oldGroups[id])
                    .ToArray();
                JsonObject? result = null;
                if (sources.Length < 2 ||
                    operation.ResultIds.Count != 1 ||
                    !newGroups.TryGetValue(operation.ResultIds[0], out result))
                    Invalid("A group merge must identify at least two prior groups and one resulting group.");
                var key = GroupCompatibilityKey(sources[0]);
                if (sources.Any(group => GroupCompatibilityKey(group) != key) ||
                    GroupCompatibilityKey(result!) != key)
                    Invalid("Incompatible product groups cannot be merged.");
                var sourceRows = sources
                    .SelectMany(group => (group["sizeQuantityRows"] as JsonArray ?? [])
                        .OfType<JsonObject>())
                    .Select(row => row["rowId"]!.GetValue<string>())
                    .OrderBy(x => x, StringComparer.Ordinal)
                    .ToArray();
                var resultRows = (result!["sizeQuantityRows"] as JsonArray ?? [])
                    .OfType<JsonObject>()
                    .Select(row => row["rowId"]!.GetValue<string>())
                    .OrderBy(x => x, StringComparer.Ordinal)
                    .ToArray();
                if (!sourceRows.SequenceEqual(resultRows, StringComparer.Ordinal))
                    Invalid("A group merge must preserve every source size row.");
            }
            else if (operation.Action == "GroupSplit")
            {
                var sourceId = operation.SourceIds.FirstOrDefault(oldGroups.ContainsKey);
                if (sourceId is null ||
                    operation.ResultIds.Count < 2 ||
                    operation.ResultIds.Any(id => !newGroups.ContainsKey(id)))
                    Invalid("A group split must identify one prior group and at least two resulting groups.");
                var source = oldGroups[sourceId];
                var key = GroupCompatibilityKey(source);
                var results = operation.ResultIds.Select(id => newGroups[id]).ToArray();
                if (results.Any(group => GroupCompatibilityKey(group) != key))
                    Invalid("A split may move size rows only; production-significant group fields must be preserved.");
                var sourceRows = (source["sizeQuantityRows"] as JsonArray ?? [])
                    .OfType<JsonObject>()
                    .Select(row => row["rowId"]!.GetValue<string>())
                    .OrderBy(x => x, StringComparer.Ordinal)
                    .ToArray();
                var resultRows = results
                    .SelectMany(group => (group["sizeQuantityRows"] as JsonArray ?? [])
                        .OfType<JsonObject>())
                    .Select(row => row["rowId"]!.GetValue<string>())
                    .OrderBy(x => x, StringComparer.Ordinal)
                    .ToArray();
                if (!sourceRows.SequenceEqual(resultRows, StringComparer.Ordinal))
                    Invalid("A group split must preserve and allocate every source size row exactly once.");
            }
            else if (operation.Action == "RowMerged")
            {
                var sourceRows = oldGroups.Values
                    .SelectMany(group => (group["sizeQuantityRows"] as JsonArray ?? [])
                        .OfType<JsonObject>())
                    .Where(row => operation.SourceIds.Contains(
                        row["rowId"]!.GetValue<string>(),
                        StringComparer.Ordinal))
                    .ToArray();
                var resultRow = newGroups.Values
                    .SelectMany(group => (group["sizeQuantityRows"] as JsonArray ?? [])
                        .OfType<JsonObject>())
                    .SingleOrDefault(row => operation.ResultIds.Contains(
                        row["rowId"]!.GetValue<string>(),
                        StringComparer.Ordinal));
                if (sourceRows.Length < 2 || resultRow is null)
                    Invalid("A row merge must identify duplicate source rows and one result row.");
                var sizes = sourceRows
                    .Select(row => AiOrderTextNormalization.NormalizeComparison(
                        row["size"]?["staffValue"]?["label"]?.GetValue<string>()))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
                var expectedQuantity = sourceRows.Sum(
                    row => row["quantity"]?["staffValue"]?.GetValue<int?>() ?? 0);
                if (sizes.Length != 1 ||
                    expectedQuantity !=
                    (resultRow["quantity"]?["staffValue"]?.GetValue<int?>() ?? 0))
                    Invalid("Duplicate row merge requires the same size and an explicitly summed quantity.");
            }
        }
    }

    private static string GroupCompatibilityKey(JsonObject group)
    {
        var selection = group["productSelection"];
        var productIdentity =
            selection?["selectedCatalogueProduct"]?["productId"]?.ToJsonString() ??
            selection?["adHocProduct"]?["adHocProductId"]?.ToJsonString() ??
            selection?["adHocProduct"]?["displayName"]?.ToJsonString() ??
            "null";
        var identity = new JsonObject
        {
            ["product"] = productIdentity,
            ["colour"] = group["colour"]?["staffValue"]?.DeepClone(),
            ["supplySource"] = group["supplySource"]?["staffValue"]?.DeepClone(),
            ["artworkIdentity"] = group["artworkIdentity"]?["staffValue"]?.DeepClone(),
            ["artworkDescription"] = group["artworkDescription"]?["staffValue"]?.DeepClone(),
            ["productionNotes"] = group["productionNotes"]?["staffValue"]?.DeepClone(),
            ["printing"] = new JsonArray((group["printing"] as JsonArray ?? [])
                .OfType<JsonObject>()
                .Select(print => (JsonNode)new JsonObject
                {
                    ["position"] = print["position"]?["staffValue"]?.DeepClone(),
                    ["printSize"] = print["printSize"]?["staffValue"]?.DeepClone(),
                    ["notes"] = print["notes"]?["staffValue"]?.DeepClone(),
                })
                .OrderBy(x => x.ToJsonString(), StringComparer.Ordinal)
                .ToArray()),
            ["pricingDistinction"] = null,
        };
        return AiOrderTextNormalization.Sha256(identity.ToJsonString(JsonOptions));
    }

    private static void RequireFinancialConflictReasons(
        JsonObject previous,
        AiOrderReviewFinancialsInput financials)
    {
        var conflictCodes = (previous["issues"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .Where(issue => issue["resolution"]?["status"]?.GetValue<string>() == "Open")
            .Select(issue => issue["code"]?.GetValue<string>())
            .ToHashSet(StringComparer.Ordinal);
        if ((conflictCodes.Contains("ORDER_TOTAL_MULTIPLE_VALUES") ||
             conflictCodes.Contains("FINANCIAL_BALANCE_MISMATCH")) &&
            financials.OrderTotal.StaffValue is not null &&
            string.IsNullOrWhiteSpace(financials.OrderTotal.Reason))
            ReasonRequired("/financials/orderTotal");
        if (conflictCodes.Contains("DEPOSIT_MULTIPLE_VALUES") &&
            financials.DepositPaid.StaffValue is not null &&
            string.IsNullOrWhiteSpace(financials.DepositPaid.Reason))
            ReasonRequired("/financials/depositPaid");
    }

    private static void RequireQuantityConflictReasons(
        JsonObject previous,
        SaveAiOrderReviewInput input)
    {
        var hasQuantityConflict = (previous["issues"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .Any(issue =>
                issue["resolution"]?["status"]?.GetValue<string>() == "Open" &&
                issue["code"]?.GetValue<string>() is
                    "QUANTITY_SUM_MISMATCH" or
                    "QUANTITY_MULTIPLE_VALUES" or
                    "DUPLICATE_SIZE_ROW_UNCERTAIN");
        if (!hasQuantityConflict)
            return;
        var hasReason = input.ProductGroups
            .SelectMany(group => group.SizeQuantityRows)
            .Any(row => !string.IsNullOrWhiteSpace(row.QuantityReason)) ||
            input.Operations.Any(operation =>
                operation.Action == "RowMerged" &&
                !string.IsNullOrWhiteSpace(operation.Reason));
        if (!hasReason)
            ReasonRequired("/productGroups/sizeQuantityRows");
    }

    private static void CollectFieldEvents(
        JsonNode? before,
        JsonNode? after,
        string path,
        ICollection<AiOrderReviewEventInput> events)
    {
        if (before is JsonObject beforeObject && after is JsonObject afterObject)
        {
            if (afterObject.ContainsKey("staffValue"))
            {
                var beforeValue = beforeObject["staffValue"];
                var afterValue = afterObject["staffValue"];
                if (JsonNode.DeepEquals(beforeValue, afterValue) &&
                    string.Equals(
                        beforeObject["decision"]?.GetValue<string>(),
                        afterObject["decision"]?.GetValue<string>(),
                        StringComparison.Ordinal))
                    return;
                var fieldAction = afterValue is null
                    ? AiOrderReviewAction.Cleared
                    : beforeValue is null
                        ? AiOrderReviewAction.Accepted
                        : AiOrderReviewAction.Corrected;
                events.Add(new(
                    fieldAction,
                    path,
                    beforeValue?.ToJsonString(JsonOptions),
                    afterValue?.ToJsonString(JsonOptions),
                    afterObject["reason"]?.GetValue<string>()));
                return;
            }
            if (path.EndsWith("/productSelection", StringComparison.Ordinal) &&
                !JsonNode.DeepEquals(beforeObject, afterObject))
            {
                events.Add(new(
                    AiOrderReviewAction.CandidateSelected,
                    path,
                    beforeObject.ToJsonString(JsonOptions),
                    afterObject.ToJsonString(JsonOptions),
                    afterObject["reason"]?.GetValue<string>() ??
                    afterObject["adHocProduct"]?["reason"]?.GetValue<string>()));
                return;
            }
            foreach (var key in beforeObject.Select(x => x.Key)
                         .Union(afterObject.Select(x => x.Key), StringComparer.Ordinal)
                         .OrderBy(x => x, StringComparer.Ordinal))
            {
                if (key is "sourceValue" or "normalizedValue" or "sourceText" or
                    "confidence" or "sourceRefs" or "sourceEvidence" or
                    "productCandidates" or "variantCandidatesByProduct" or
                    "compatibleVariants" or "groupingEvidence" or "catalogueQuote" or
                    "writtenBalance")
                    continue;
                CollectFieldEvents(
                    beforeObject[key],
                    afterObject[key],
                    $"{path}/{EscapePointer(key)}",
                    events);
            }
            return;
        }
        if (before is JsonArray beforeArray && after is JsonArray afterArray)
        {
            if (JsonNode.DeepEquals(beforeArray, afterArray))
                return;
            events.Add(new(
                AiOrderReviewAction.Corrected,
                path,
                beforeArray.ToJsonString(JsonOptions),
                afterArray.ToJsonString(JsonOptions),
                null));
            return;
        }
        if (JsonNode.DeepEquals(before, after))
            return;
        var action = after is null
            ? AiOrderReviewAction.Cleared
            : path.Contains("/selectedCatalogueProduct", StringComparison.Ordinal) ||
              path.EndsWith("/confirmedProductVariantId", StringComparison.Ordinal)
                ? AiOrderReviewAction.CandidateSelected
                : before is null ? AiOrderReviewAction.Accepted : AiOrderReviewAction.Corrected;
        events.Add(new(
            action,
            path,
            before?.ToJsonString(JsonOptions),
            after?.ToJsonString(JsonOptions),
            null));
    }

    private static JsonObject EditedTextField(
        JsonObject? prior,
        AiOrderReviewTextInput input,
        string path)
    {
        var value = BoundedOptional(input.StaffValue, 2000, "review text");
        RequireReasonForSensitiveField(
            prior,
            value is null ? null : JsonValue.Create(value),
            input.Decision,
            input.Reason,
            path);
        return EditedField(
            prior,
            value is null ? null : JsonValue.Create(value),
            NormalizeDecision(input.Decision),
            BoundedOptional(input.Reason, 1000, "review reason"));
    }

    private static JsonObject EditedMoneyField(
        JsonObject? prior,
        AiOrderReviewMoneyInput input,
        string path)
    {
        string? value = null;
        if (!string.IsNullOrWhiteSpace(input.StaffValue))
        {
            if (!AiOrderTextNormalization.TryNormalizeMoney(
                    input.StaffValue.Trim(),
                    out value,
                    out _))
                Invalid("Financial values must be non-negative NZD amounts with exact cents.");
        }
        RequireReasonForSensitiveField(
            prior,
            value is null ? null : JsonValue.Create(value),
            input.Decision,
            input.Reason,
            path);
        var field = EditedField(
            prior,
            value is null ? null : JsonValue.Create(value),
            NormalizeDecision(input.Decision),
            BoundedOptional(input.Reason, 1000, "financial reason"));
        field["currency"] = "NZD";
        return field;
    }

    private static JsonObject EditedControlledField(
        JsonObject? prior,
        AiOrderReviewControlledValueInput input,
        string path,
        IReadOnlyCollection<string> allowedKinds)
    {
        JsonNode? value = null;
        if (input.Kind is not null || input.Label is not null)
        {
            var kind = BoundedRequired(input.Kind, 32, "controlled value kind");
            if (!allowedKinds.Contains(kind, StringComparer.Ordinal))
                Invalid($"Unsupported controlled value kind '{kind}'.");
            var label = BoundedRequired(input.Label, 128, "controlled value label");
            if (kind == "NotApplicable" && label != "Not Applicable")
                Invalid("Not Applicable must use the controlled label exactly.");
            if (kind == "OneSize" && label != "One Size")
                Invalid("One Size must use the controlled label exactly.");
            value = new JsonObject
            {
                ["kind"] = kind,
                ["label"] = label,
            };
            if ((kind is "Custom" ||
                 prior?["normalizedValue"]?["kind"]?.GetValue<string>() != kind ||
                 !Same(
                     prior?["normalizedValue"]?["label"]?.GetValue<string>(),
                     label)) &&
                string.IsNullOrWhiteSpace(input.Reason) &&
                input.Decision is "Confirmed" or "Corrected")
                ReasonRequired(path);
        }
        RequireReasonForSensitiveField(
            prior,
            value,
            input.Decision,
            input.Reason,
            path);
        return EditedField(
            prior,
            value,
            NormalizeDecision(input.Decision),
            BoundedOptional(input.Reason, 1000, "controlled-value reason"));
    }

    private static JsonObject EditedField(
        JsonObject? prior,
        JsonNode? staffValue,
        string decision,
        string? reason) =>
        new()
        {
            ["sourceValue"] = prior?["sourceValue"]?.DeepClone(),
            ["normalizedValue"] = prior?["normalizedValue"]?.DeepClone(),
            ["staffValue"] = staffValue?.DeepClone(),
            ["decision"] = decision,
            ["sourceText"] = prior?["sourceText"]?.DeepClone(),
            ["confidence"] = prior?["confidence"]?.DeepClone(),
            ["sourceRefs"] = prior?["sourceRefs"]?.DeepClone() ?? new JsonArray(),
            ["reason"] = reason,
            ["cleared"] = staffValue is null &&
                          (prior?["normalizedValue"] is not null ||
                           prior?["staffValue"] is not null),
            ["unresolved"] = staffValue is null || decision == "Unresolved",
        };

    private static JsonObject InitialField(JsonObject? evidence)
    {
        var source = evidence?["normalization"]?["originalValue"]?.DeepClone() ??
                     evidence?["value"]?.DeepClone();
        var normalized = evidence?["normalization"]?["normalizedValue"]?.DeepClone() ??
                         evidence?["value"]?.DeepClone();
        var requiresConfirmation =
            evidence?["normalization"]?["requiresConfirmation"]?.GetValue<bool>() == true;
        return new JsonObject
        {
            ["sourceValue"] = source,
            ["normalizedValue"] = normalized,
            ["staffValue"] = normalized?.DeepClone(),
            ["decision"] = normalized is null
                ? "Unresolved"
                : requiresConfirmation ? "Unresolved" : "Accepted",
            ["sourceText"] = evidence?["sourceText"]?.DeepClone(),
            ["confidence"] = evidence?["confidence"]?.DeepClone(),
            ["sourceRefs"] = evidence?["sourceRefs"]?.DeepClone() ?? new JsonArray(),
            ["reason"] = null,
            ["cleared"] = false,
            ["unresolved"] = normalized is null || requiresConfirmation,
        };
    }

    private static JsonObject InitialMoneyField(JsonObject? evidence)
    {
        var field = InitialField(evidence);
        var amount = evidence?["value"]?["amount"]?.DeepClone();
        field["normalizedValue"] = amount;
        field["staffValue"] = amount?.DeepClone();
        field["currency"] = "NZD";
        field["unresolved"] = amount is null ||
                              field["decision"]?.GetValue<string>() == "Unresolved";
        return field;
    }

    private static JsonObject EmptyField() => new()
    {
        ["sourceValue"] = null,
        ["normalizedValue"] = null,
        ["staffValue"] = null,
        ["decision"] = "Unresolved",
        ["sourceText"] = null,
        ["confidence"] = null,
        ["sourceRefs"] = new JsonArray(),
        ["reason"] = null,
        ["cleared"] = false,
        ["unresolved"] = true,
    };

    private static JsonObject? BuildInitialAdHoc(JsonObject? proposal, string groupId)
    {
        if (proposal is null)
            return null;
        return new JsonObject
        {
            ["adHocProductId"] = StableId(groupId, "ad-hoc", 0),
            ["displayName"] = proposal["normalizedDisplayName"]?.DeepClone() ??
                              proposal["writtenName"]?.DeepClone(),
            ["brand"] = proposal["brand"]?.DeepClone(),
            ["supplierName"] = proposal["supplierName"]?.DeepClone(),
            ["supplierCode"] = proposal["supplierCode"]?.DeepClone(),
            ["supplySource"] = proposal["supplySource"]?.DeepClone(),
            ["inventoryBehavior"] = "NotTracked",
            ["confirmed"] = false,
            ["acknowledgedOrderOnly"] = false,
            ["reason"] = null,
        };
    }

    private static JsonObject CloneIssueWithOpenResolution(JsonObject issue)
    {
        var clone = issue.DeepClone() as JsonObject ?? new JsonObject();
        clone["resolution"] = new JsonObject
        {
            ["status"] = "Open",
        };
        return clone;
    }

    private static void AddIssue(
        ICollection<JsonObject> issues,
        string code,
        string category,
        bool blocking,
        IEnumerable<string> paths,
        string message)
    {
        var pathArray = new JsonArray(paths
            .Select(x => (JsonNode?)JsonValue.Create(x))
            .ToArray());
        var id = AiOrderTextNormalization.Sha256(
            $"{code}\n{pathArray.ToJsonString()}")[..32];
        issues.Add(new JsonObject
        {
            ["issueId"] = id,
            ["code"] = code,
            ["category"] = category,
            ["severity"] = blocking ? "Blocking" : "Warning",
            ["paths"] = pathArray,
            ["message"] = message,
            ["observedValues"] = new JsonArray(),
            ["sourceRefs"] = new JsonArray(),
            ["resolution"] = new JsonObject
            {
                ["status"] = "Open",
            },
        });
    }

    private static JsonObject Readiness(bool ready, int blocking, string message) => new()
    {
        ["readyToConfirm"] = ready,
        ["blockingIssueCount"] = blocking,
        ["catalogueSelectionsCurrent"] = true,
        ["message"] = message,
        ["confirmationOwnedBy"] = "Jira 10207",
        ["confirmOrderEnabled"] = false,
    };

    private static decimal? MoneyAmount(JsonObject? field)
    {
        var value = field?["staffValue"]?.GetValue<string>();
        return decimal.TryParse(
            value,
            NumberStyles.Number,
            CultureInfo.InvariantCulture,
            out var amount)
            ? amount
            : null;
    }

    private static JsonObject Money(decimal amount) => new()
    {
        ["currency"] = "NZD",
        ["amount"] = amount.ToString("0.00", CultureInfo.InvariantCulture),
    };

    private static bool IsOpenBlocking(JsonObject issue) =>
        issue["severity"]?.GetValue<string>() == "Blocking" &&
        issue["resolution"]?["status"]?.GetValue<string>() == "Open";

    private static bool IsOpenWarning(JsonObject issue) =>
        issue["severity"]?.GetValue<string>() == "Warning" &&
        issue["resolution"]?["status"]?.GetValue<string>() == "Open";

    private static string RowSortKey(JsonObject row)
    {
        var kind = row["size"]?["staffValue"]?["kind"]?.GetValue<string>() ?? "Z";
        var label = row["size"]?["staffValue"]?["label"]?.GetValue<string>() ?? string.Empty;
        var known = new[]
        {
            "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL",
            "One Size",
        };
        var index = Array.FindIndex(
            known,
            x => Same(x, label));
        return $"{(index < 0 ? 999 : index):D3}:{kind}:{label.ToUpperInvariant()}";
    }

    private static void EnsureInputBounds(SaveAiOrderReviewInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        if (input.ExpectedRevision < 1)
            Invalid("Expected revision is mandatory and must be positive.");
        if (input.ProductGroups.Count > AiOrderStaffReviewVersions.MaximumGroups)
            Invalid($"A review may contain at most {AiOrderStaffReviewVersions.MaximumGroups} product groups.");
        if (input.IssueResolutions.Count > AiOrderStaffReviewVersions.MaximumIssueResolutions)
            Invalid("Too many issue-resolution decisions were submitted.");
        if (input.Operations.Count > AiOrderStaffReviewVersions.MaximumOperations)
            Invalid("Too many review operations were submitted.");
    }

    private static void RequireReasonForSensitiveField(
        JsonObject? prior,
        JsonNode? value,
        string decision,
        string? reason,
        string path)
    {
        var normalizedDecision = NormalizeDecision(decision);
        var sourceDerived = prior?["sourceValue"] is not null ||
                            prior?["normalizedValue"] is not null;
        var lowConfidence =
            prior?["confidence"] is JsonValue confidenceValue &&
            confidenceValue.TryGetValue<decimal>(out var confidence) &&
            confidence < 0.75m;
        if ((normalizedDecision == "Cleared" && sourceDerived ||
             lowConfidence && normalizedDecision is "Corrected" or "Confirmed") &&
            string.IsNullOrWhiteSpace(reason))
            ReasonRequired(path);
        if (value is null && normalizedDecision != "Cleared" && sourceDerived)
            Invalid($"Clearing {path} requires the Cleared decision.");
    }

    private static string NormalizeDecision(string? value)
    {
        var decision = value?.Trim();
        return decision switch
        {
            "Unresolved" or "Accepted" or "Corrected" or "Cleared" or "Confirmed" =>
                decision,
            _ => throw Safe(
                AiOrderImportErrorCodes.ReviewDocumentInvalid,
                "Field decision must be Unresolved, Accepted, Corrected, Cleared, or Confirmed."),
        };
    }

    private static bool TryOperationAction(
        string value,
        out AiOrderReviewAction action) =>
        Enum.TryParse(value, ignoreCase: false, out action) &&
        action is AiOrderReviewAction.GroupAdded or
            AiOrderReviewAction.GroupRemoved or
            AiOrderReviewAction.GroupMerged or
            AiOrderReviewAction.GroupSplit or
            AiOrderReviewAction.GroupDuplicated or
            AiOrderReviewAction.GroupReordered or
            AiOrderReviewAction.RowAdded or
            AiOrderReviewAction.RowRemoved or
            AiOrderReviewAction.RowMerged;

    private static string? FindOperationReason(
        IReadOnlyList<AiOrderReviewOperationInput> operations,
        string action,
        string id) =>
        operations.FirstOrDefault(x =>
            x.Action == action &&
            (x.SourceIds.Contains(id, StringComparer.Ordinal) ||
             x.ResultIds.Contains(id, StringComparer.Ordinal)))?.Reason;

    private static string StableId(string parent, string kind, int index) =>
        AiOrderTextNormalization.Sha256($"{parent}\n{kind}\n{index}")[..32];

    private static string SafeId(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value;

    private static string EnsureClientId(string value, string name)
    {
        var id = BoundedRequired(value, 128, name);
        if (id.Any(char.IsControl) ||
            id.Contains('/', StringComparison.Ordinal) ||
            id.Contains('~', StringComparison.Ordinal))
            Invalid($"{name} contains unsupported characters.");
        return id;
    }

    private static string BoundedRequired(string? value, int maximum, string name) =>
        BoundedOptional(value, maximum, name) ??
        throw Safe(
            AiOrderImportErrorCodes.ReviewDocumentInvalid,
            $"{name} is required.");

    private static string? BoundedOptional(string? value, int maximum, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        var normalized = value.Trim();
        if (normalized.Length > maximum || normalized.Any(ch => ch == '\0'))
            Invalid($"{name} exceeds its safe length.");
        return normalized;
    }

    private static bool Same(string? left, string? right) =>
        string.Equals(
            AiOrderTextNormalization.NormalizeComparison(left),
            AiOrderTextNormalization.NormalizeComparison(right),
            StringComparison.Ordinal);

    private static bool IsAmbiguousSize(string value) =>
        value.Contains('/', StringComparison.Ordinal) ||
        value.Contains(" or ", StringComparison.OrdinalIgnoreCase);

    private static string EscapePointer(string value) =>
        value.Replace("~", "~0", StringComparison.Ordinal)
            .Replace("/", "~1", StringComparison.Ordinal);

    [DoesNotReturn]
    private static void ReasonRequired(string path) =>
        throw Safe(
            AiOrderImportErrorCodes.ReviewReasonRequired,
            $"A reason is required for the sensitive decision at {path}.");

    [DoesNotReturn]
    private static void Invalid(string message) =>
        throw Safe(AiOrderImportErrorCodes.ReviewDocumentInvalid, message);

    private static BusinessException Safe(string code, string message) =>
        new(code, message);
}
