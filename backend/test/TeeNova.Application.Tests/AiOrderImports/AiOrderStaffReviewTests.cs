using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.Validation;
using TeeNova.Catalog;
using Volo.Abp;
using Xunit;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderStaffReviewTests
{
    private static readonly Guid ImportId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid ValidationId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    private static readonly Guid AdminId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly Guid ProductId = Guid.Parse("40000000-0000-0000-0000-000000000001");
    private static readonly Guid VariantM = Guid.Parse("50000000-0000-0000-0000-000000000001");
    private static readonly Guid VariantL = Guid.Parse("50000000-0000-0000-0000-000000000002");
    private static readonly DateTime Now = new(2026, 7, 31, 1, 2, 3, DateTimeKind.Utc);
    private readonly AiOrderStaffReviewEngine _engine = new();

    [Fact]
    public void Initial_review_preserves_evidence_and_does_not_auto_select_candidate()
    {
        var initial = Initial();
        var selection = initial["productGroups"]![0]!["productSelection"]!;

        Assert.Equal(AiOrderStaffReviewVersions.Review, initial["reviewVersion"]!.GetValue<string>());
        Assert.Equal("Unresolved", selection["mode"]!.GetValue<string>());
        Assert.Null(selection["selectedCatalogueProduct"]);
        Assert.Single(selection["productCandidates"]!.AsArray());
        Assert.Equal(
            "Tee",
            initial["productGroups"]![0]!["writtenProductName"]!["sourceValue"]!
                .GetValue<string>());
        Assert.Equal(
            "Tee",
            initial["productGroups"]![0]!["writtenProductName"]!["normalizedValue"]!
                .GetValue<string>());
    }

    [Fact]
    public void Initial_review_records_the_actual_validation_revision_canonical_hash()
    {
        var validation = Validation(withCandidate: true);
        var validationRevisionHash = new string('d', 64);

        var initial = _engine.BuildInitialDocument(
            ImportId,
            2,
            2,
            ValidationId,
            validationRevisionHash,
            validation);

        Assert.Equal(
            validationRevisionHash,
            initial["sourceValidationRevision"]!["canonicalSha256"]!.GetValue<string>());
        Assert.NotEqual(
            validation["normalizedContentSha256"]!.GetValue<string>(),
            initial["sourceValidationRevision"]!["canonicalSha256"]!.GetValue<string>());
    }

    [Fact]
    public void Subsequent_review_uses_the_current_staff_revision_as_base_and_server_metadata()
    {
        var initial = Initial();
        var firstInput = ValidCatalogueInput(initial);
        firstInput.Customer.Name = Text("First staff value");
        var first = Build(initial, firstInput);
        var secondInput = ValidCatalogueInput(first.Document);
        secondInput.ExpectedRevision = 3;
        secondInput.Customer.Name = new AiOrderReviewTextInput
        {
            StaffValue = "Second staff value",
            Decision = "Corrected",
            Reason = "Confirmed against the source image",
        };
        var secondActor = Guid.Parse("30000000-0000-0000-0000-000000000002");
        var secondTime = Now.AddMinutes(5);
        var validationHash = new string('e', 64);

        var second = _engine.BuildReviewedDocument(
            ImportId,
            3,
            2,
            ValidationId,
            validationHash,
            first.Document,
            secondInput,
            [Catalogue()],
            secondActor,
            secondTime);

        Assert.Equal(3, second.Document["baseRevision"]!.GetValue<int>());
        Assert.Equal(4, second.Document["revision"]!.GetValue<int>());
        Assert.Equal(
            validationHash,
            second.Document["sourceValidationRevision"]!["canonicalSha256"]!.GetValue<string>());
        Assert.Equal(
            secondActor,
            second.Document["editorMetadata"]!["lastEditedByAdminId"]!.GetValue<Guid>());
        Assert.Equal(
            secondTime.ToString("O"),
            second.Document["editorMetadata"]!["lastEditedAt"]!.GetValue<string>());
        Assert.Contains(
            second.Events,
            item =>
                item.Action == AiOrderReviewAction.Corrected &&
                item.BeforeJson is not null &&
                item.AfterJson is not null);
        Assert.Equal(AiOrderReviewAction.DraftSaved, second.Events[^1].Action);
    }

    [Fact]
    public void Complete_catalogue_review_is_ready_and_derives_balance()
    {
        var previous = Initial();
        var result = Build(previous, ValidCatalogueInput(previous));

        Assert.True(result.ReadyToConfirm);
        Assert.Equal(0, result.BlockingIssueCount);
        Assert.Equal(
            "100.00",
            result.Document["financials"]!["balanceDue"]!["amount"]!.GetValue<string>());
        Assert.Equal(
            VariantM,
            result.Document["productGroups"]![0]!["sizeQuantityRows"]![0]!
                ["confirmedProductVariantId"]!.GetValue<Guid>());
        Assert.Contains(result.Events, x => x.Action == AiOrderReviewAction.CandidateSelected);
        Assert.Equal(AiOrderReviewAction.DraftSaved, result.Events[^1].Action);
        Assert.Contains(
            result.Events,
            x => x.BeforeJson is not null && x.AfterJson is not null);
    }

    [Fact]
    public void Unmatched_product_opens_as_a_confirmed_ad_hoc_group()
    {
        var initial = Initial(withCandidate: false);
        var selection = initial["productGroups"]![0]!["productSelection"]!;

        Assert.Equal("AdHoc", selection["mode"]!.GetValue<string>());
        Assert.True(selection["adHocProduct"]!["confirmed"]!.GetValue<bool>());
        Assert.True(selection["adHocProduct"]!["acknowledgedOrderOnly"]!.GetValue<bool>());
        Assert.Equal(
            "Custom Pullover",
            selection["adHocProduct"]!["displayName"]!.GetValue<string>());
    }

    [Fact]
    public void Missing_contact_details_fall_back_to_placeholders()
    {
        var initial = Initial();
        var customer = initial["customer"]!;

        Assert.Equal("Internal", customer["name"]!["staffValue"]!.GetValue<string>());
        Assert.Equal("Internal", customer["phone"]!["staffValue"]!.GetValue<string>());
        Assert.Equal(
            "yituoxx@gmail.com",
            customer["email"]!["staffValue"]!.GetValue<string>());
        Assert.False(customer["name"]!["unresolved"]!.GetValue<bool>());
        // Unimportant details stay blank.
        Assert.Null(customer["organisation"]!["staffValue"]);
    }

    [Fact]
    public void Extracted_contact_details_are_never_overwritten()
    {
        var validation = Validation(withCandidate: true);
        validation["customer"]!["email"] = Evidence("aroha@example.com");

        var initial = _engine.BuildInitialDocument(
            ImportId,
            2,
            2,
            ValidationId,
            new string('a', 64),
            validation);

        Assert.Equal(
            "aroha@example.com",
            initial["customer"]!["email"]!["staffValue"]!.GetValue<string>());
    }

    [Fact]
    public void Size_without_a_catalogue_variant_becomes_an_ad_hoc_row_instead_of_a_blocker()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].SizeQuantityRows[0].Size = Controlled("Catalogue", "5XL", "Accepted");
        input.ProductGroups[0].SizeQuantityRows[0].ConfirmedProductVariantId = null;

        var result = Build(previous, input);
        var row = result.Document["productGroups"]![0]!["sizeQuantityRows"]![0]!;

        Assert.True(result.ReadyToConfirm);
        Assert.True(row["adHocFallback"]!.GetValue<bool>());
        Assert.Null(row["confirmedProductVariantId"]);
        Assert.DoesNotContain(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "VARIANT_NOT_FOUND");
        Assert.Contains(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "ROW_FALLS_BACK_TO_AD_HOC" &&
                 x["severity"]!.GetValue<string>() == "Warning");
    }

    [Fact]
    public void Matched_sizes_keep_their_catalogue_variant_when_a_sibling_row_falls_back()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].SizeQuantityRows =
        [
            .. input.ProductGroups[0].SizeQuantityRows,
            new AiOrderReviewSizeRowInput
            {
                RowId = "row-oversize",
                Size = Controlled("Catalogue", "5XL", "Accepted"),
                Quantity = 1,
                QuantityDecision = "Accepted",
            },
        ];

        var result = Build(previous, input);
        var rows = result.Document["productGroups"]![0]!["sizeQuantityRows"]!.AsArray();
        var matched = rows.OfType<JsonObject>().Single(
            x => x["size"]!["staffValue"]!["label"]!.GetValue<string>() == "M");
        var fallback = rows.OfType<JsonObject>().Single(
            x => x["size"]!["staffValue"]!["label"]!.GetValue<string>() == "5XL");

        Assert.True(result.ReadyToConfirm);
        Assert.Equal(VariantM, matched["confirmedProductVariantId"]!.GetValue<Guid>());
        Assert.False(matched["adHocFallback"]!.GetValue<bool>());
        Assert.True(fallback["adHocFallback"]!.GetValue<bool>());
    }

    [Fact]
    public void Explicit_zero_deposit_is_present_and_creates_no_blocker()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.Financials.DepositPaid.StaffValue = "0.00";

        var result = Build(previous, input);

        Assert.True(result.ReadyToConfirm);
        Assert.Equal(
            "100.00",
            result.Document["financials"]!["balanceDue"]!["amount"]!.GetValue<string>());
        Assert.DoesNotContain(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "DEPOSIT_PAID_MISSING");
    }

    [Fact]
    public void Missing_values_can_save_as_incomplete_review()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].ProductSelection.Mode = "Unresolved";
        input.ProductGroups[0].ProductSelection.CatalogueProductId = null;
        input.ProductGroups[0].SizeQuantityRows[0].ConfirmedProductVariantId = null;
        input.Financials.DepositPaid.StaffValue = null;
        input.Financials.DepositPaid.Decision = "Cleared";
        input.Financials.DepositPaid.Reason = "Source entry deliberately cleared for follow-up";

        var result = Build(previous, input);

        Assert.False(result.ReadyToConfirm);
        Assert.True(result.BlockingIssueCount >= 2);
        Assert.Contains(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "PRODUCT_UNRESOLVED");
        Assert.Contains(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "DEPOSIT_PAID_MISSING");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1001)]
    public void Invalid_quantity_is_structurally_rejected(int quantity)
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].SizeQuantityRows[0].Quantity = quantity;

        var exception = Assert.Throws<BusinessException>(() => Build(previous, input));

        Assert.Equal(AiOrderImportErrorCodes.ReviewDocumentInvalid, exception.Code);
    }

    [Fact]
    public void Deposit_above_total_remains_blocking_and_balance_is_not_derived()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.Financials.DepositPaid.StaffValue = "101.00";
        input.Financials.DepositPaid.Decision = "Corrected";
        input.Financials.DepositPaid.Reason = "Confirmed from receipt evidence";

        var result = Build(previous, input);

        Assert.False(result.ReadyToConfirm);
        Assert.Null(result.Document["financials"]!["balanceDue"]);
        Assert.Contains(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "DEPOSIT_EXCEEDS_TOTAL");
    }

    [Fact]
    public void Unknown_or_inactive_catalogue_product_is_rejected()
    {
        var previous = Initial();
        var arbitrary = ValidCatalogueInput(previous);
        arbitrary.ProductGroups[0].ProductSelection.CatalogueProductId = Guid.NewGuid();
        var arbitraryError = Assert.Throws<BusinessException>(() => Build(previous, arbitrary));

        var inactiveCatalogue = Catalogue() with
        {
            IsActive = false,
        };
        var inactive = ValidCatalogueInput(previous);
        var inactiveError = Assert.Throws<BusinessException>(() =>
            Build(previous, inactive, [inactiveCatalogue]));

        Assert.Equal(AiOrderImportErrorCodes.CatalogueSelectionInvalid, arbitraryError.Code);
        Assert.Equal(AiOrderImportErrorCodes.CatalogueSelectionInvalid, inactiveError.Code);
    }

    [Fact]
    public void Variant_must_belong_to_product_and_match_colour_and_size()
    {
        var previous = Initial();
        var wrongId = ValidCatalogueInput(previous);
        wrongId.ProductGroups[0].SizeQuantityRows[0].ConfirmedProductVariantId = Guid.NewGuid();
        var wrongProduct = Assert.Throws<BusinessException>(() => Build(previous, wrongId));

        var wrongSize = ValidCatalogueInput(previous);
        wrongSize.ProductGroups[0].SizeQuantityRows[0].ConfirmedProductVariantId = VariantL;
        var wrongSizeError = Assert.Throws<BusinessException>(() => Build(previous, wrongSize));

        Assert.Equal(AiOrderImportErrorCodes.VariantSelectionInvalid, wrongProduct.Code);
        Assert.Equal(AiOrderImportErrorCodes.VariantSelectionInvalid, wrongSizeError.Code);
    }

    [Fact]
    public void Missing_compatible_variant_keeps_review_blocking()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].SizeQuantityRows[0].ConfirmedProductVariantId = null;

        var result = Build(previous, input);

        Assert.False(result.ReadyToConfirm);
        Assert.Contains(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "VARIANT_NOT_FOUND");
    }

    [Fact]
    public void Non_garment_catalogue_product_accepts_controlled_not_applicable_and_one_size()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].Colour = Controlled(
            "NotApplicable",
            "Not Applicable",
            "Confirmed",
            "This badge has no garment colour");
        input.ProductGroups[0].SizeQuantityRows[0].Size = Controlled(
            "OneSize",
            "One Size",
            "Accepted");
        input.ProductGroups[0].SizeQuantityRows[0].ConfirmedProductVariantId = null;
        var badge = new AiOrderCatalogueProductSnapshot(
            ProductId,
            "Round Badge",
            ProductKind.Badge,
            PricingModel.QuantityTierUnit,
            true,
            []);

        var result = Build(previous, input, [badge]);

        Assert.True(result.ReadyToConfirm);
        Assert.DoesNotContain(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "VARIANT_NOT_FOUND");
    }

    [Fact]
    public void Valid_ad_hoc_product_is_order_only_and_not_tracked()
    {
        var previous = Initial(withCandidate: false);
        var input = ValidAdHocInput(previous);

        var result = Build(previous, input, []);
        var adHoc = result.Document["productGroups"]![0]!["productSelection"]!["adHocProduct"]!;

        Assert.True(result.ReadyToConfirm);
        Assert.True(adHoc["confirmed"]!.GetValue<bool>());
        Assert.Equal("NotTracked", adHoc["inventoryBehavior"]!.GetValue<string>());
        Assert.Null(result.Document["productGroups"]![0]!["productSelection"]!["selectedCatalogueProduct"]);
        Assert.DoesNotContain("sku", adHoc.ToJsonString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Ad_hoc_confirmation_requires_only_a_display_name()
    {
        var previous = Initial(withCandidate: false);
        var unnamed = ValidAdHocInput(previous);
        unnamed.ProductGroups[0].ProductSelection.AdHocProduct!.DisplayName = " ";

        Assert.Throws<BusinessException>(() => Build(previous, unnamed, []));

        var bare = ValidAdHocInput(previous);
        bare.ProductGroups[0].ProductSelection.AdHocProduct!.AcknowledgedOrderOnly = false;
        bare.ProductGroups[0].ProductSelection.AdHocProduct!.Reason = null;

        var result = Build(previous, bare, []);
        var adHoc = result.Document["productGroups"]![0]!["productSelection"]!["adHocProduct"]!;

        Assert.True(result.ReadyToConfirm);
        Assert.True(adHoc["acknowledgedOrderOnly"]!.GetValue<bool>());
        Assert.False(string.IsNullOrWhiteSpace(adHoc["reason"]!.GetValue<string>()));
    }

    [Fact]
    public void Custom_colour_and_size_need_no_reason_for_an_ad_hoc_product()
    {
        var previous = Initial(withCandidate: false);
        var input = ValidAdHocInput(previous);
        input.ProductGroups[0].Colour.Reason = null;
        input.ProductGroups[0].SizeQuantityRows[0].Size.Reason = null;

        var result = Build(previous, input, []);

        Assert.True(result.ReadyToConfirm);
    }

    [Fact]
    public void Corrected_catalogue_colour_still_requires_an_explicit_reason()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].Colour = Controlled("Named", "Charcoal", "Corrected");

        var error = Assert.Throws<BusinessException>(() => Build(previous, input));

        Assert.Equal(AiOrderImportErrorCodes.ReviewReasonRequired, error.Code);
    }

    [Fact]
    public void Ambiguous_size_can_be_deliberately_confirmed_only_for_ad_hoc()
    {
        var previous = Initial(withCandidate: false);
        var input = ValidAdHocInput(previous);
        input.ProductGroups[0].SizeQuantityRows[0].Size.Label = "M/L";

        var result = Build(previous, input, []);

        Assert.True(result.ReadyToConfirm);
        Assert.DoesNotContain(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "SIZE_UNCERTAIN");
    }

    [Fact]
    public void Duplicate_sizes_remain_blocking_until_explicitly_merged()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        var first = input.ProductGroups[0].SizeQuantityRows[0];
        input.ProductGroups[0].SizeQuantityRows =
        [
            first,
            new AiOrderReviewSizeRowInput
            {
                RowId = Guid.NewGuid().ToString("D"),
                Size = new AiOrderReviewControlledValueInput
                {
                    Kind = "Catalogue",
                    Label = "M",
                    Decision = "Accepted",
                },
                Quantity = 1,
                QuantityDecision = "Accepted",
                ConfirmedProductVariantId = VariantM,
            },
        ];

        var result = Build(previous, input);

        Assert.False(result.ReadyToConfirm);
        Assert.Contains(
            result.Document["issues"]!.AsArray().OfType<JsonObject>(),
            x => x["code"]!.GetValue<string>() == "DUPLICATE_SIZE_ROW_UNCERTAIN");
    }

    [Fact]
    public void Incompatible_groups_cannot_be_merged()
    {
        var previous = Initial();
        var second = previous["productGroups"]![0]!.DeepClone() as JsonObject ?? new();
        second["groupId"] = "group-b";
        second["colour"]!["staffValue"]!["label"] = "White";
        previous["productGroups"]!.AsArray().Add(second);
        var input = ValidCatalogueInput(previous);
        input.ProductGroups[0].SizeQuantityRows =
        [
            input.ProductGroups[0].SizeQuantityRows[0],
            new AiOrderReviewSizeRowInput
            {
                RowId = second["sizeQuantityRows"]![0]!["rowId"]!.GetValue<string>(),
                Size = new AiOrderReviewControlledValueInput
                {
                    Kind = "Catalogue",
                    Label = "M",
                    Decision = "Accepted",
                },
                Quantity = 1,
                QuantityDecision = "Accepted",
                ConfirmedProductVariantId = VariantM,
            },
        ];
        input.Operations =
        [
            new AiOrderReviewOperationInput
            {
                Action = "GroupMerged",
                SourceIds = ["group-a", "group-b"],
                ResultIds = ["group-a"],
                Reason = "Attempted merge",
            },
        ];

        var exception = Assert.Throws<BusinessException>(() => Build(previous, input));

        Assert.Equal(AiOrderImportErrorCodes.ReviewDocumentInvalid, exception.Code);
    }

    [Fact]
    public void Save_dto_cannot_mass_assign_server_owned_fields()
    {
        var names = typeof(SaveAiOrderReviewInput)
            .GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Select(x => x.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        Assert.DoesNotContain("ActorAdminId", names);
        Assert.DoesNotContain("RecordedAt", names);
        Assert.DoesNotContain("CanonicalSha256", names);
        Assert.DoesNotContain("FormalOrderId", names);
        Assert.DoesNotContain("ConfirmationEvidence", names);
        Assert.DoesNotContain("PrivateObjectKey", names);
        Assert.DoesNotContain("BalanceDue", names);
    }

    [Fact]
    public void Review_write_and_catalogue_search_routes_are_explicit()
    {
        var save = typeof(AiOrderImportsController).GetMethod("SaveReviewAsync")!;
        var search = typeof(AiOrderImportsController).GetMethod("SearchReviewCatalogueAsync")!;

        Assert.Equal(
            "{id:guid}/review",
            save.GetCustomAttribute<HttpPutAttribute>()!.Template);
        Assert.Equal(
            "{id:guid}/review/catalogue",
            search.GetCustomAttribute<HttpGetAttribute>()!.Template);
        Assert.NotNull(save.GetCustomAttribute<RequestSizeLimitAttribute>());
    }

    [Fact]
    public void Review_actions_cover_structural_edit_evidence()
    {
        var expected = new[]
        {
            AiOrderReviewAction.Accepted,
            AiOrderReviewAction.Corrected,
            AiOrderReviewAction.Cleared,
            AiOrderReviewAction.CandidateSelected,
            AiOrderReviewAction.IssueResolved,
            AiOrderReviewAction.GroupAdded,
            AiOrderReviewAction.GroupRemoved,
            AiOrderReviewAction.GroupMerged,
            AiOrderReviewAction.GroupSplit,
            AiOrderReviewAction.RowAdded,
            AiOrderReviewAction.RowRemoved,
            AiOrderReviewAction.DraftSaved,
        };

        Assert.All(expected, action => Assert.True(Enum.IsDefined(action)));
    }

    [Fact]
    public void Needs_review_save_transitions_only_to_draft_and_draft_stays_draft()
    {
        var import = new AiOrderImport(
            ImportId,
            AdminId,
            "1.0",
            "review-transition",
            new string('a', 64),
            "standard");
        import.ClaimProcessingLease("lease", Now.AddMinutes(5), Now);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease", Now);

        import.AdvanceRevision(1, 2);
        import.MarkDraft();
        Assert.Equal(AiOrderImportStatus.Draft, import.Status);

        import.AdvanceRevision(2, 3);
        import.MarkDraft();
        Assert.Equal(AiOrderImportStatus.Draft, import.Status);
        Assert.Equal(3, import.CurrentRevision);
        Assert.Null(import.FormalOrderId);
    }

    [Fact]
    public void Stale_revision_cannot_advance_or_create_a_duplicate_revision()
    {
        var import = new AiOrderImport(
            ImportId,
            AdminId,
            "1.0",
            "review-concurrency",
            new string('a', 64),
            "standard");
        import.ClaimProcessingLease("lease", Now.AddMinutes(5), Now);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease", Now);
        import.AdvanceRevision(1, 2);
        import.MarkDraft();

        var exception = Assert.Throws<BusinessException>(() =>
            import.AdvanceRevision(1, 2));

        Assert.Equal("TeeNova:AiOrderImport:RevisionConflict", exception.Code);
        Assert.Equal(2, import.CurrentRevision);
        Assert.Equal(AiOrderImportStatus.Draft, import.Status);
    }

    [Fact]
    public void Expected_revision_is_mandatory_for_review_builds()
    {
        var previous = Initial();
        var input = ValidCatalogueInput(previous);
        input.ExpectedRevision = 0;

        var exception = Assert.Throws<BusinessException>(() =>
            _engine.BuildReviewedDocument(
                ImportId,
                0,
                2,
                ValidationId,
                new string('a', 64),
                previous,
                input,
                [Catalogue()],
                AdminId,
                Now));

        Assert.Equal(AiOrderImportErrorCodes.ReviewDocumentInvalid, exception.Code);
    }

    [Theory]
    [InlineData("UX_AiOrderImportRevisions_Import_Revision")]
    [InlineData("IX_AiOrderImportRevisions_ImportId_Revision")]
    [InlineData("duplicate key in AiOrderImportRevisions for ImportId and Revision")]
    public void Revision_race_detection_accepts_configured_and_database_generated_index_names(
        string databaseMessage)
    {
        var method = typeof(AiOrderReviewAppService).GetMethod(
            "IsRevisionUniquenessConflict",
            BindingFlags.Static | BindingFlags.NonPublic)!;
        var exception = new DbUpdateException(
            "Revision insert failed.",
            new InvalidOperationException(databaseMessage));

        var result = (bool)method.Invoke(null, [exception])!;

        Assert.True(result);
    }

    private JsonObject Initial(bool withCandidate = true) =>
        _engine.BuildInitialDocument(
            ImportId,
            2,
            2,
            ValidationId,
            new string('a', 64),
            Validation(withCandidate));

    private AiOrderStaffReviewBuildResult Build(
        JsonObject previous,
        SaveAiOrderReviewInput input,
        IReadOnlyList<AiOrderCatalogueProductSnapshot>? catalogue = null) =>
        _engine.BuildReviewedDocument(
            ImportId,
            2,
            2,
            ValidationId,
            new string('a', 64),
            previous,
            input,
            catalogue ?? [Catalogue()],
            AdminId,
            Now);

    private static AiOrderCatalogueProductSnapshot Catalogue() =>
        new(
            ProductId,
            "Classic Tee",
            ProductKind.Garment,
            PricingModel.GarmentPrint,
            true,
            [
                new(VariantM, "TEE-BLK-M", "Black", "M", true),
                new(VariantL, "TEE-BLK-L", "Black", "L", true),
            ]);

    private static SaveAiOrderReviewInput ValidCatalogueInput(JsonObject previous)
    {
        var group = previous["productGroups"]![0]!;
        var row = group["sizeQuantityRows"]![0]!;
        return new SaveAiOrderReviewInput
        {
            ExpectedRevision = 2,
            ReviewVersion = AiOrderStaffReviewVersions.Review,
            Customer = new AiOrderReviewCustomerInput(),
            ProductGroups =
            [
                new AiOrderReviewProductGroupInput
                {
                    GroupId = group["groupId"]!.GetValue<string>(),
                    WrittenProductName = Text("Tee"),
                    ProductSelection = new AiOrderReviewProductSelectionInput
                    {
                        Mode = "Catalogue",
                        CatalogueProductId = ProductId,
                    },
                    Colour = Controlled("Named", "Black", "Accepted"),
                    SupplySource = Text("Shop"),
                    ArtworkIdentity = Text(null),
                    ArtworkDescription = Text(null),
                    ProductionNotes = Text(null),
                    SizeQuantityRows =
                    [
                        new AiOrderReviewSizeRowInput
                        {
                            RowId = row["rowId"]!.GetValue<string>(),
                            Size = Controlled("Catalogue", "M", "Accepted"),
                            Quantity = 2,
                            QuantityDecision = "Accepted",
                            ConfirmedProductVariantId = VariantM,
                        },
                    ],
                },
            ],
            Financials = new AiOrderReviewFinancialsInput
            {
                OrderTotal = MoneyInput("100.00"),
                DepositPaid = MoneyInput("0.00"),
            },
        };
    }

    private static SaveAiOrderReviewInput ValidAdHocInput(JsonObject previous)
    {
        var input = ValidCatalogueInput(previous);
        var group = input.ProductGroups[0];
        group.ProductSelection = new AiOrderReviewProductSelectionInput
        {
            Mode = "AdHoc",
            AdHocProduct = new AiOrderReviewAdHocProductInput
            {
                DisplayName = "Custom Pullover",
                Confirmed = true,
                AcknowledgedOrderOnly = true,
                Reason = "Confirmed customer-supplied garment",
            },
        };
        group.Colour = Controlled(
            "Named",
            "Fluoro Yellow",
            "Confirmed",
            "Confirmed custom colour from source");
        group.SizeQuantityRows[0].Size = Controlled(
            "Custom",
            "M",
            "Confirmed",
            "Confirmed custom supplier size");
        group.SizeQuantityRows[0].ConfirmedProductVariantId = null;
        return input;
    }

    private static AiOrderReviewTextInput Text(string? value) => new()
    {
        StaffValue = value,
        Decision = value is null ? "Unresolved" : "Accepted",
    };

    private static AiOrderReviewMoneyInput MoneyInput(string? value) => new()
    {
        StaffValue = value,
        Decision = value is null ? "Unresolved" : "Accepted",
    };

    private static AiOrderReviewControlledValueInput Controlled(
        string kind,
        string label,
        string decision,
        string? reason = null) =>
        new()
        {
            Kind = kind,
            Label = label,
            Decision = decision,
            Reason = reason,
        };

    private static JsonObject Validation(bool withCandidate)
    {
        var candidate = new JsonObject
        {
            ["productId"] = ProductId,
            ["productName"] = "Classic Tee",
            ["productKind"] = "Garment",
            ["pricingModel"] = "GarmentPrint",
            ["score"] = 0.94m,
            ["matchKind"] = "ExactName",
            ["recommendation"] = "Recommended",
            ["active"] = true,
            ["reasons"] = new JsonArray("exact name"),
        };
        return new JsonObject
        {
            ["normalizedContentSha256"] = new string('b', 64),
            ["catalogueFingerprint"] = "catalogue",
            ["catalogueValidatedAt"] = Now.ToString("O"),
            ["customer"] = new JsonObject
            {
                ["name"] = Evidence(null),
                ["phone"] = Evidence(null),
                ["email"] = Evidence(null),
                ["organisation"] = Evidence(null),
                ["addressOrFulfilmentNotes"] = Evidence(null),
            },
            ["productGroups"] = new JsonArray(new JsonObject
            {
                ["groupId"] = "group-a",
                ["groupingKeySha256"] = new string('c', 64),
                ["groupingKeyVersion"] = "typed-canonical-json-v1",
                ["writtenProductDescription"] = Evidence("Tee"),
                ["productResolution"] = new JsonObject
                {
                    ["productCandidates"] =
                        withCandidate ? new JsonArray(candidate) : new JsonArray(),
                    ["adHocProposal"] = withCandidate
                        ? null
                        : new JsonObject
                        {
                            ["normalizedDisplayName"] = "Custom Pullover",
                            ["inventoryBehavior"] = "NotTracked",
                        },
                },
                ["colour"] = Evidence(new JsonObject
                {
                    ["kind"] = "Named",
                    ["label"] = "Black",
                }),
                ["supplySource"] = Evidence("Shop"),
                ["artworkIdentity"] = Evidence(null),
                ["artworkDescription"] = Evidence(null),
                ["printing"] = new JsonArray(),
                ["sizeQuantityRows"] = new JsonArray(new JsonObject
                {
                    ["size"] = Evidence(new JsonObject
                    {
                        ["kind"] = "Catalogue",
                        ["label"] = "M",
                    }),
                    ["quantity"] = Evidence(2),
                    ["variantCandidatesByProduct"] = new JsonArray(),
                    ["sourceEvidence"] = new JsonArray(),
                }),
                ["sourceEvidence"] = new JsonArray(),
            }),
            ["financials"] = new JsonObject
            {
                ["orderTotal"] = MoneyEvidence("100.00"),
                ["depositPaid"] = MoneyEvidence("0.00"),
                ["balanceDue"] = new JsonObject
                {
                    ["currency"] = "NZD",
                    ["amount"] = "100.00",
                },
                ["derivationStatus"] = "Complete",
            },
            ["issues"] = new JsonArray(),
        };
    }

    private static JsonObject Evidence(object? value)
    {
        var node = value switch
        {
            null => null,
            JsonNode json => json,
            string text => JsonValue.Create(text),
            int integer => JsonValue.Create(integer),
            _ => JsonSerializer.SerializeToNode(value),
        };
        return new JsonObject
        {
            ["presence"] = node is null ? "missing" : "stated",
            ["value"] = node?.DeepClone(),
            ["sourceText"] = node?.ToString(),
            ["confidence"] = node is null ? null : 0.99m,
            ["sourceRefs"] = new JsonArray(),
            ["normalization"] = new JsonObject
            {
                ["originalValue"] = node?.DeepClone(),
                ["normalizedValue"] = node?.DeepClone(),
                ["rule"] = "test",
                ["requiresConfirmation"] = false,
            },
        };
    }

    private static JsonObject MoneyEvidence(string value) =>
        Evidence(new JsonObject
        {
            ["currency"] = "NZD",
            ["amount"] = value,
        });
}
