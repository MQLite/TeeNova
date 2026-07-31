using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Validation;
using TeeNova.Catalog;
using Xunit;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderValidationTests
{
    private static readonly Guid ImportId =
        Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid RevisionId =
        Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ProductId =
        Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid OtherProductId =
        Guid.Parse("44444444-4444-4444-4444-444444444444");

    [Theory]
    [InlineData("  AS\u00a0Colour   Staple\u2014Tee ", "AS Colour Staple-Tee")]
    [InlineData(" Black\t\n Tee ", "Black Tee")]
    public void Text_normalization_is_unicode_and_whitespace_stable(
        string input,
        string expected)
    {
        Assert.Equal(expected, AiOrderTextNormalization.NormalizeText(input));
    }

    [Theory]
    [InlineData(" pt-blk / m ", "PTBLKM")]
    [InlineData("abc_123", "ABC123")]
    public void Product_code_normalization_is_deterministic(
        string input,
        string expected)
    {
        Assert.Equal(expected, AiOrderTextNormalization.NormalizeProductCode(input));
    }

    [Theory]
    [InlineData("$123", true, "123.00", null)]
    [InlineData("NZD 123.40", true, "123.40", null)]
    [InlineData("0", true, "0.00", null)]
    [InlineData("1.001", false, null, "fractional-cent")]
    [InlineData("-1.00", false, null, "negative")]
    public void Money_normalization_never_rounds(
        string input,
        bool valid,
        string? amount,
        string? error)
    {
        Assert.Equal(
            valid,
            AiOrderTextNormalization.TryNormalizeMoney(input, out var actual, out var actualError));
        Assert.Equal(amount, actual);
        Assert.Equal(error, actualError);
    }

    [Theory]
    [InlineData(1, true, null)]
    [InlineData(1000, true, null)]
    [InlineData(0, false, "not-positive")]
    [InlineData(-1, false, "not-positive")]
    [InlineData(1001, false, "above-maximum")]
    public void Quantity_policy_enforces_positive_current_ceiling(
        int input,
        bool valid,
        string? error)
    {
        Assert.Equal(
            valid,
            AiOrderTextNormalization.TryNormalizeQuantity(
                JsonValue.Create(input),
                out var quantity,
                out var actualError));
        Assert.Equal(input, quantity);
        Assert.Equal(error, actualError);
    }

    [Fact]
    public void Fractional_quantity_is_invalid()
    {
        Assert.False(AiOrderTextNormalization.TryNormalizeQuantity(
            JsonValue.Create(1.5m),
            out _,
            out var error));
        Assert.Equal("fractional-or-invalid", error);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1001)]
    public void Invalid_quantity_in_review_document_is_blocking(int quantity)
    {
        var result = Validate(
            Source(
                [Group("AS Colour Staple Tee", "Black", ("M", quantity))],
                "20.00",
                "0.00"),
            Catalogue());

        Assert.Contains("QUANTITY_MULTIPLE_VALUES", IssueCodes(result.Document));
        Assert.True(result.BlockingIssueCount > 0);
    }

    [Fact]
    public void Matcher_ranks_exact_sku_then_exact_name_and_bounds_results()
    {
        var catalogue = Catalogue()
            .Concat(Enumerable.Range(0, 8).Select(index =>
                new AiOrderCatalogueProductSnapshot(
                    Guid.Parse($"50000000-0000-0000-0000-{index + 1:000000000000}"),
                    $"Staple Tee {index}",
                    ProductKind.Garment,
                    PricingModel.GarmentPrint,
                    true,
                    [])))
            .ToArray();
        var matcher = new AiOrderCatalogueMatcher();

        var sku = matcher.MatchProducts(
            "unrelated",
            "ST-BLK-M",
            "Black",
            ["M"],
            catalogue);
        var name = matcher.MatchProducts(
            "AS Colour Staple Tee",
            null,
            "Black",
            ["M"],
            catalogue);

        Assert.Equal(ProductId, sku[0]["productId"]!.GetValue<Guid>());
        Assert.Equal("ExactSku", sku[0]["matchKind"]!.GetValue<string>());
        Assert.Equal(ProductId, name[0]["productId"]!.GetValue<Guid>());
        Assert.Equal("ExactNormalizedName", name[0]["matchKind"]!.GetValue<string>());
        Assert.True(name.Count <= AiOrderValidationVersions.MaximumProductCandidates);
        Assert.Equal("Recommended", name[0]["recommendation"]!.GetValue<string>());
        Assert.False(name[0].ContainsKey("confirmedCatalogueProduct"));
    }

    [Fact]
    public void Variant_matching_never_substitutes_wrong_colour_or_size()
    {
        var matcher = new AiOrderCatalogueMatcher();
        var product = Catalogue()[0];

        var exact = matcher.MatchVariants(product, null, "Black", "M");
        var wrongColour = matcher.MatchVariants(product, null, "White", "M");
        var wrongSize = matcher.MatchVariants(product, null, "Black", "4XL");

        Assert.Single(exact);
        Assert.Empty(wrongColour);
        Assert.Empty(wrongSize);
        Assert.Equal("Black", exact[0]["colour"]!.GetValue<string>());
        Assert.Equal("M", exact[0]["size"]!.GetValue<string>());
    }

    [Fact]
    public void Typed_group_key_excludes_size_and_quantity_and_prevents_delimiter_collision()
    {
        var grouping = new AiOrderGroupingNormalizer();
        var left = GroupKeyFragment("a|b", "c");
        var right = GroupKeyFragment("a", "b|c");
        var changedSize = left.DeepClone().AsObject();
        changedSize["size"] = "XL";
        changedSize["quantity"] = 999;

        Assert.NotEqual(grouping.CreateTypedGroupKey(left), grouping.CreateTypedGroupKey(right));
        Assert.Equal(
            grouping.CreateTypedGroupKey(left),
            grouping.CreateTypedGroupKey(changedSize));
    }

    [Fact]
    public void Full_validation_groups_sizes_derives_balance_and_preserves_evidence()
    {
        var group = Group(
            "AS Colour Staple Tee",
            "BLK",
            ("M", 2),
            ("L", 3));
        var result = Validate(Source([group], "150.00", "50.00"), Catalogue());
        var groups = result.Document["productGroups"]!.AsArray();
        var normalizedGroup = groups[0]!.AsObject();
        var codes = IssueCodes(result.Document);

        Assert.Single(groups);
        Assert.Equal(2, normalizedGroup["sizeQuantityRows"]!.AsArray().Count);
        Assert.Equal(
            "ApprovedAlias",
            normalizedGroup["colour"]!["resolution"]!.GetValue<string>());
        Assert.Equal(
            "Black",
            normalizedGroup["colour"]!["value"]!["label"]!.GetValue<string>());
        Assert.Equal(
            "100.00",
            result.Document["financials"]!["balanceDue"]!["amount"]!.GetValue<string>());
        Assert.Contains("PRODUCT_MATCH_CONFIRMATION_REQUIRED", codes);
        Assert.NotEmpty(normalizedGroup["sourceEvidence"]!.AsArray());
        Assert.Equal(64, result.CanonicalSha256.Length);
        Assert.Equal("ai-order-validation-v1", result.Document["validationVersion"]!.GetValue<string>());
    }

    [Fact]
    public void Different_colours_artwork_positions_sizes_and_supply_sources_split_groups()
    {
        var groups = new[]
        {
            Group("AS Colour Staple Tee", "Black", ("M", 1)),
            Group("AS Colour Staple Tee", "Navy", ("M", 1)),
            Group("AS Colour Staple Tee", "Black", ("M", 1), artwork: "Other Logo"),
            Group("AS Colour Staple Tee", "Black", ("M", 1), position: "Back"),
            Group("AS Colour Staple Tee", "Black", ("M", 1), printSize: "A3"),
            Group("AS Colour Staple Tee", "Black", ("M", 1), supply: "Customer"),
        };

        var result = Validate(Source(groups, "10.00", "0.00"), Catalogue());

        Assert.Equal(6, result.Document["productGroups"]!.AsArray().Count);
    }

    [Fact]
    public void Duplicate_size_rows_are_not_silently_combined()
    {
        var result = Validate(
            Source([Group("AS Colour Staple Tee", "Black", ("M", 2), ("M", 3))],
                "100.00",
                "0.00"),
            Catalogue());
        var row = result.Document["productGroups"]![0]!["sizeQuantityRows"]![0]!;

        Assert.Equal(5, row["proposedCombinedQuantity"]!.GetValue<int>());
        Assert.True(row["requiresDuplicateConfirmation"]!.GetValue<bool>());
        Assert.Contains("DUPLICATE_SIZE_ROW_UNCERTAIN", IssueCodes(result.Document));
        Assert.Equal(2, row["sourceEvidence"]!.AsArray().Count);
    }

    [Fact]
    public void Unknown_product_produces_not_tracked_ad_hoc_proposal()
    {
        var result = Validate(
            Source([Group("Kauri Workwear Pullover", "Fluoro Yellow", ("2XL", 2))],
                "90.00",
                "20.00"),
            Catalogue());
        var resolution = result.Document["productGroups"]![0]!["productResolution"]!;

        Assert.Equal("AdHocProposal", resolution["mode"]!.GetValue<string>());
        Assert.Equal(
            "NotTracked",
            resolution["adHocProposal"]!["inventoryBehavior"]!.GetValue<string>());
        Assert.Contains("AD_HOC_PRODUCT_CONFIRMATION_REQUIRED", IssueCodes(result.Document));
    }

    [Theory]
    [InlineData("M/L", "SIZE_UNCERTAIN")]
    [InlineData("M or L", "SIZE_UNCERTAIN")]
    [InlineData("Custom 37", "CUSTOM_SIZE_CONFIRMATION_REQUIRED")]
    public void Ambiguous_and_custom_sizes_require_confirmation(string size, string code)
    {
        var result = Validate(
            Source([Group("Unknown garment", "Black", (size, 1))], "20.00", "0.00"),
            Catalogue());

        Assert.Contains(code, IssueCodes(result.Document));
    }

    [Fact]
    public void One_size_is_a_controlled_value()
    {
        var result = Validate(
            Source([Group("Unknown badge", "N/A", ("OS", 10))], "20.00", "0.00"),
            Catalogue());
        var row = result.Document["productGroups"]![0]!["sizeQuantityRows"]![0]!;

        Assert.Equal("OneSize", row["size"]!["resolution"]!.GetValue<string>());
        Assert.Equal("One Size", row["size"]!["value"]!["label"]!.GetValue<string>());
        Assert.Contains(
            "COLOUR_NOT_APPLICABLE_CONFIRMATION_REQUIRED",
            IssueCodes(result.Document));
    }

    [Fact]
    public void Missing_required_fields_and_explicit_zero_are_distinct()
    {
        var missing = Validate(
            Source([Group(null, null, (null, null))], null, null),
            Catalogue());
        var zero = Validate(
            Source([Group("AS Colour Staple Tee", "Black", ("M", 1))], "50.00", "0.00"),
            Catalogue());

        var missingCodes = IssueCodes(missing.Document);
        Assert.Contains("PRODUCT_MISSING", missingCodes);
        Assert.Contains("COLOUR_MISSING", missingCodes);
        Assert.Contains("SIZE_MISSING", missingCodes);
        Assert.Contains("QUANTITY_MISSING", missingCodes);
        Assert.Contains("ORDER_TOTAL_MISSING", missingCodes);
        Assert.Contains("DEPOSIT_PAID_MISSING", missingCodes);
        Assert.DoesNotContain("DEPOSIT_PAID_MISSING", IssueCodes(zero.Document));
        Assert.Equal(
            "50.00",
            zero.Document["financials"]!["balanceDue"]!["amount"]!.GetValue<string>());
    }

    [Fact]
    public void Deposit_above_total_and_written_balance_mismatch_are_blocking()
    {
        var above = Validate(
            Source([Group("AS Colour Staple Tee", "Black", ("M", 1))],
                "20.00",
                "30.00"),
            Catalogue());
        var mismatchSource = Source(
            [Group("AS Colour Staple Tee", "Black", ("M", 1))],
            "20.00",
            "5.00");
        mismatchSource["financials"]!["writtenBalance"] = MoneyEvidence("10.00");
        var mismatch = Validate(mismatchSource, Catalogue());

        Assert.Contains("DEPOSIT_EXCEEDS_TOTAL", IssueCodes(above.Document));
        Assert.Null(above.Document["financials"]!["balanceDue"]);
        Assert.Contains("FINANCIAL_BALANCE_MISMATCH", IssueCodes(mismatch.Document));
        Assert.Equal("15.00", mismatch.Document["financials"]!["balanceDue"]!["amount"]!.GetValue<string>());
    }

    [Fact]
    public void Low_confidence_required_field_blocks_but_optional_customer_does_not()
    {
        var group = Group("AS Colour Staple Tee", "Black", ("M", 1));
        group["garmentColour"]!["confidence"] = 0.2m;
        var source = Source([group], "20.00", "0.00");
        var result = Validate(source, Catalogue());
        var issues = result.Document["issues"]!.AsArray().Select(x => x!.AsObject()).ToArray();

        Assert.Contains(issues, x =>
            x["code"]!.GetValue<string>() == "LOW_CONFIDENCE_REQUIRED_FIELD" &&
            x["severity"]!.GetValue<string>() == "Blocking");
        Assert.Contains(issues, x =>
            x["code"]!.GetValue<string>() == "CUSTOMER_CONTACT_MISSING" &&
            x["severity"]!.GetValue<string>() == "Warning");
    }

    [Fact]
    public void Canonical_hash_and_grouping_are_deterministic()
    {
        var first = Group("AS Colour Staple Tee", "Black", ("M", 1));
        var second = Group("AS Colour Staple Tee", "Black", ("L", 2));
        var at = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var left = Validate(Source([first, second], "50.00", "0.00"), Catalogue(), at);
        var right = Validate(Source([second, first], "50.00", "0.00"), Catalogue(), at);

        Assert.Equal(
            left.Document["productGroups"]![0]!["groupingKeySha256"]!.GetValue<string>(),
            right.Document["productGroups"]![0]!["groupingKeySha256"]!.GetValue<string>());
        Assert.Equal(left.CatalogueFingerprint, right.CatalogueFingerprint);
        Assert.Equal(left.ValidationInputHash, right.ValidationInputHash);
    }

    [Fact]
    public void Catalogue_fingerprint_changes_for_product_or_variant_staleness()
    {
        var original = Catalogue();
        var changed = original.Select(product =>
            product.Id == ProductId
                ? product with
                {
                    IsActive = false,
                    Variants = product.Variants.Select(variant =>
                        variant with { IsAvailable = false }).ToArray(),
                }
                : product).ToArray();

        Assert.NotEqual(
            AiOrderExtractionNormalizer.CreateCatalogueFingerprint(original),
            AiOrderExtractionNormalizer.CreateCatalogueFingerprint(changed));
    }

    [Fact]
    public void Review_contract_excludes_raw_provider_and_private_storage_fields()
    {
        var result = Validate(
            Source([Group("AS Colour Staple Tee", "Black", ("M", 1))], "20.00", "0.00"),
            Catalogue());

        Assert.DoesNotContain("rawResult", result.CanonicalJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("privateObjectKey", result.CanonicalJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("physicalPath", result.CanonicalJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("renderedPrompt", result.CanonicalJson, StringComparison.OrdinalIgnoreCase);
    }

    private static AiOrderValidationBuildResult Validate(
        JsonObject source,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        DateTime? at = null)
    {
        var options = Options.Create(new AiOrderValidationOptions());
        var normalizer = new AiOrderExtractionNormalizer(
            new AiOrderCatalogueMatcher(),
            new AiOrderGroupingNormalizer(),
            new AiOrderFinancialValidator(),
            options);
        return normalizer.NormalizeAndValidate(
            ImportId,
            1,
            RevisionId,
            new string('a', 64),
            source.ToJsonString(),
            catalogue,
            at ?? new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc));
    }

    private static IReadOnlyList<AiOrderCatalogueProductSnapshot> Catalogue() =>
    [
        new(
            ProductId,
            "AS Colour Staple Tee",
            ProductKind.Garment,
            PricingModel.GarmentPrint,
            true,
            [
                new(
                    Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001"),
                    "ST-BLK-M",
                    "Black",
                    "M",
                    true),
                new(
                    Guid.Parse("aaaaaaaa-0000-0000-0000-000000000002"),
                    "ST-BLK-L",
                    "Black",
                    "L",
                    true),
                new(
                    Guid.Parse("aaaaaaaa-0000-0000-0000-000000000003"),
                    "ST-NVY-M",
                    "Navy",
                    "M",
                    true),
                new(
                    Guid.Parse("aaaaaaaa-0000-0000-0000-000000000004"),
                    "ST-BLK-XL",
                    "Black",
                    "XL",
                    false),
            ]),
        new(
            OtherProductId,
            "Pullover Hoodie",
            ProductKind.Garment,
            PricingModel.GarmentPrint,
            false,
            [
                new(
                    Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001"),
                    "HD-BLK-M",
                    "Black",
                    "M",
                    false),
            ]),
    ];

    private static JsonObject Source(
        IEnumerable<JsonObject> groups,
        string? total,
        string? deposit) =>
        new()
        {
            ["contractVersion"] = "1.0",
            ["customer"] = new JsonObject
            {
                ["name"] = Evidence(null),
                ["phone"] = Evidence(null),
                ["email"] = Evidence(null),
                ["company"] = Evidence(null),
                ["addressOrFulfilmentNotes"] = Evidence(null),
            },
            ["productGroups"] = new JsonArray(
                groups.Select(x => (JsonNode)x.DeepClone()).ToArray()),
            ["financials"] = new JsonObject
            {
                ["orderTotal"] = MoneyEvidence(total),
                ["depositPaid"] = MoneyEvidence(deposit),
                ["writtenBalance"] = MoneyEvidence(null),
                ["currencyEvidence"] = Evidence(total is null ? null : "NZD"),
                ["alternatives"] = new JsonArray(),
            },
            ["warnings"] = new JsonArray(),
        };

    private static JsonObject Group(
        string? product,
        string? colour,
        params (string? Size, int? Quantity)[] rows) =>
        Group(product, colour, rows, "Logo", "Front", "A4", "Shop");

    private static JsonObject Group(
        string? product,
        string? colour,
        (string? Size, int? Quantity)[] rows,
        string artwork,
        string position,
        string printSize,
        string supply) =>
        new()
        {
            ["resolutionMode"] = "Unresolved",
            ["writtenProductDescription"] = Evidence(product),
            ["brand"] = Evidence(null),
            ["supplier"] = Evidence(null),
            ["supplierOrProductCode"] = Evidence(null),
            ["garmentColour"] = Evidence(colour),
            ["supplySource"] = Evidence(supply),
            ["sizeQuantityRows"] = new JsonArray(rows.Select(row => (JsonNode)new JsonObject
            {
                ["size"] = Evidence(row.Size),
                ["quantity"] = QuantityEvidence(row.Quantity),
                ["sourceText"] = row.Size is null ? null : $"{row.Size} x {row.Quantity}",
                ["warnings"] = new JsonArray(),
            }).ToArray()),
            ["artworkIdentity"] = Evidence(artwork),
            ["artworkDescription"] = Evidence(null),
            ["printing"] = new JsonArray
            {
                new JsonObject
                {
                    ["position"] = Evidence(position),
                    ["printSize"] = Evidence(printSize),
                    ["notes"] = Evidence(null),
                },
            },
            ["sourceText"] = product,
            ["confidence"] = 0.99m,
            ["sourceRefs"] = SourceRefs(),
            ["warnings"] = new JsonArray(),
            ["alternatives"] = new JsonArray(),
        };

    private static JsonObject Group(
        string? product,
        string? colour,
        (string? Size, int? Quantity) row,
        string artwork = "Logo",
        string position = "Front",
        string printSize = "A4",
        string supply = "Shop") =>
        Group(product, colour, [row], artwork, position, printSize, supply);

    private static JsonObject Evidence(string? value, decimal confidence = 0.99m) =>
        new()
        {
            ["presence"] = value is null ? "missing" : "stated",
            ["value"] = value,
            ["sourceText"] = value,
            ["confidence"] = value is null ? null : confidence,
            ["sourceRefs"] = value is null ? new JsonArray() : SourceRefs(),
        };

    private static JsonObject QuantityEvidence(int? value) =>
        new()
        {
            ["presence"] = value.HasValue ? "stated" : "missing",
            ["value"] = value,
            ["sourceText"] = value?.ToString(),
            ["confidence"] = value.HasValue ? 0.99m : null,
            ["sourceRefs"] = value.HasValue ? SourceRefs() : new JsonArray(),
        };

    private static JsonObject MoneyEvidence(string? amount) =>
        new()
        {
            ["presence"] = amount is null ? "missing" : "stated",
            ["value"] = amount is null
                ? null
                : new JsonObject
                {
                    ["currency"] = "NZD",
                    ["amount"] = amount,
                },
            ["sourceText"] = amount,
            ["confidence"] = amount is null ? null : 0.99m,
            ["sourceRefs"] = amount is null ? new JsonArray() : SourceRefs(),
        };

    private static JsonArray SourceRefs() =>
        new()
        {
            new JsonObject
            {
                ["sourceDocumentId"] = Guid.Parse(
                    "cccccccc-cccc-cccc-cccc-cccccccccccc"),
                ["page"] = 1,
                ["region"] = null,
            },
        };

    private static HashSet<string> IssueCodes(JsonObject document) =>
        document["issues"]!
            .AsArray()
            .Select(x => x!["code"]!.GetValue<string>())
            .ToHashSet(StringComparer.Ordinal);

    private static JsonObject GroupKeyFragment(string product, string colour) =>
        new()
        {
            ["productIdentity"] = product,
            ["colourKey"] = colour,
            ["supplySourceKey"] = "SHOP",
            ["artworkKey"] = "LOGO",
            ["printingKey"] = new JsonArray(),
            ["productionNotesKey"] = null,
            ["pricingKey"] = null,
            ["size"] = "M",
            ["quantity"] = 1,
        };
}
