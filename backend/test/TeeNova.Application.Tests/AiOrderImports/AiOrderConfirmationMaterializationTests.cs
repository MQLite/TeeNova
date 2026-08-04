using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.Auth;
using TeeNova.Orders;
using Volo.Abp;

namespace TeeNova.AiOrderImports.Tests;

public sealed class AiOrderConfirmationMaterializationTests
{
    private static readonly Guid AdminId =
        Guid.Parse("71000000-0000-0000-0000-000000000001");
    private static readonly Guid ImportId =
        Guid.Parse("71000000-0000-0000-0000-000000000002");
    private static readonly DateTime Now =
        new(2026, 7, 31, 10, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Confirmation_seals_exact_staff_revision_without_creating_order()
    {
        var import = DraftImport();

        import.Confirm(
            AdminId,
            1,
            new string('a', 64),
            "ai-order-staff-review-v1",
            0,
            "confirm-operation",
            Now);

        Assert.Equal(AiOrderImportStatus.Confirmed, import.Status);
        Assert.Equal(1, import.ConfirmedRevision);
        Assert.Equal(new string('a', 64), import.ConfirmedCanonicalSha256);
        Assert.Equal("ai-order-staff-review-v1", import.ConfirmedReviewVersion);
        Assert.Equal(0, import.ConfirmedBlockingIssueCount);
        Assert.Equal(AdminId, import.ConfirmedByAdminId);
        Assert.Equal(Now, import.ConfirmedAt);
        Assert.Null(import.FormalOrderId);
        Assert.Null(import.MaterializationOperationKey);
    }

    [Fact]
    public void Confirmation_rejects_nonzero_blocking_count()
    {
        var import = DraftImport();

        Assert.Throws<BusinessException>(() => import.Confirm(
            AdminId,
            1,
            new string('a', 64),
            "ai-order-staff-review-v1",
            1,
            "confirm-operation",
            Now));
    }

    [Fact]
    public void Confirmed_import_rejects_review_mutation_but_accepts_dedicated_linkage()
    {
        var import = ConfirmedImport();
        var orderId = Guid.NewGuid();

        Assert.Throws<BusinessException>(() => import.AdvanceRevision(1, 2));
        Assert.Throws<BusinessException>(() => import.MarkDraft());

        import.LinkFormalOrder(
            orderId,
            "materialize-operation",
            new string('b', 64),
            AdminId,
            Now.AddMinutes(1));

        Assert.Equal(orderId, import.FormalOrderId);
        Assert.Equal("materialize-operation", import.MaterializationOperationKey);
        Assert.Equal(new string('b', 64), import.MaterializationRequestHash);
        Assert.Equal(AdminId, import.MaterializedByAdminId);
    }

    [Fact]
    public void Formal_linkage_is_idempotent_only_for_same_operation_and_request()
    {
        var import = ConfirmedImport();
        var orderId = Guid.NewGuid();
        import.LinkFormalOrder(
            orderId,
            "materialize-operation",
            new string('b', 64),
            AdminId,
            Now);

        import.LinkFormalOrder(
            orderId,
            "materialize-operation",
            new string('b', 64),
            AdminId,
            Now.AddMinutes(1));

        Assert.Throws<BusinessException>(() => import.LinkFormalOrder(
            Guid.NewGuid(),
            "different-operation",
            new string('c', 64),
            AdminId,
            Now.AddMinutes(2)));
    }

    [Fact]
    public void Ad_hoc_item_has_exactly_one_non_catalogue_source_and_is_not_inventory_eligible()
    {
        var snapshotId = Guid.NewGuid();
        var item = OrderItem.CreateAdHoc(
            Guid.NewGuid(),
            Guid.NewGuid(),
            snapshotId,
            "Customer supplied pullover",
            "Yellow",
            "2XL",
            2,
            25m);

        Assert.Equal(OrderItemProductSource.AdHoc, item.ProductSource);
        Assert.Null(item.ProductId);
        Assert.Equal(snapshotId, item.OrderAdHocProductSnapshotId);
        Assert.False(item.InventoryDeductionEligible);
        Assert.Equal("Yellow", item.ColourSnapshot);
        Assert.Equal("2XL", item.SizeSnapshot);
    }

    [Fact]
    public void Ai_order_provenance_preserves_written_and_calculated_totals()
    {
        var order = NewOrder();
        order.MarkCreatedFromAiImport(
            ImportId,
            3,
            new string('d', 64),
            AdminId,
            Now,
            "materialize-operation",
            AdminId,
            Now.AddMinutes(1),
            90m,
            100m,
            "UseWrittenTotal",
            "Agreed counter price");

        Assert.Equal(OrderSource.AiOrderImport, order.Source);
        Assert.Equal(ImportId, order.SourceAiOrderImportId);
        Assert.Equal(90m, order.AiWrittenOrderTotal);
        Assert.Equal(100m, order.AiCalculatedMaterializationTotal);
        Assert.Equal("UseWrittenTotal", order.AiPricingMode);
    }

    [Fact]
    public void Manual_deposit_updates_payment_only_and_never_production_status()
    {
        var order = NewOrder();
        order.AddItem(new OrderItem(
            Guid.NewGuid(),
            order.Id,
            Guid.NewGuid(),
            null,
            "Badge",
            null,
            1,
            50m));
        order.DeliveryMethod = DeliveryMethod.Shipping;
        order.InitializePaymentRequirement();

        order.ApplyPayment(50m, ManualPaymentMethod.BankTransfer, "Receipt 1234", null, Now);

        Assert.Equal(PaymentStatus.Paid, order.PaymentStatus);
        Assert.Equal(OrderStatus.Pending, order.Status);
    }

    [Fact]
    public void Materialization_contract_excludes_mass_assigned_order_fields()
    {
        var names = typeof(MaterializeAiOrderImportInput)
            .GetProperties()
            .Select(x => x.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        Assert.DoesNotContain("OrderId", names);
        Assert.DoesNotContain("OrderNumber", names);
        Assert.DoesNotContain("OrderStatus", names);
        Assert.DoesNotContain("PaidAmount", names);
        Assert.DoesNotContain("BalanceDue", names);
        Assert.DoesNotContain("PaymentTransactionId", names);
    }

    [Fact]
    public void Confirmation_contract_accepts_only_revision_and_operation_key()
    {
        var properties = typeof(ConfirmAiOrderImportInput)
            .GetProperties()
            .Select(x => x.Name)
            .ToHashSet(StringComparer.Ordinal);
        Assert.Equal(2, properties.Count);
        Assert.Contains("ExpectedRevision", properties);
        Assert.Contains("ConfirmationOperationKey", properties);
    }

    [Fact]
    public void Dedicated_service_has_no_email_online_payment_inventory_deduction_or_pdf_dependency()
    {
        var dependencyNames = typeof(AiOrderConfirmationMaterializationService)
            .GetConstructors()
            .Single()
            .GetParameters()
            .Select(x => x.ParameterType.Name)
            .ToArray();

        Assert.DoesNotContain(dependencyNames, x => x.Contains("Email", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(dependencyNames, x => x.Contains("OnlinePayment", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(dependencyNames, x => x.Contains("InventoryDeduction", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(dependencyNames, x => x.Contains("Production", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(dependencyNames, x => x.Contains("Pdf", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(dependencyNames, x => x == nameof(OrderAppService));
    }

    [Fact]
    public void Confirmation_and_materialization_routes_are_admin_only_and_separate()
    {
        var controller = typeof(AiOrderImportsController);
        var authorize = controller.GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal(TeeNovaRoles.Admin, authorize?.Roles);
        AssertRoute(controller, nameof(AiOrderImportsController.ConfirmAsync), "{id:guid}/confirm");
        AssertRoute(
            controller,
            nameof(AiOrderImportsController.GetMaterializationPreflightAsync),
            "{id:guid}/materialization-preflight");
        AssertRoute(controller, nameof(AiOrderImportsController.MaterializeAsync), "{id:guid}/materialize");
    }

    [Fact]
    public void Positive_import_payment_snapshots_source_and_received_time()
    {
        var transaction = new PaymentTransaction(
            Guid.NewGuid(),
            Guid.NewGuid(),
            20m,
            ManualPaymentMethod.Cash,
            "Counter receipt",
            "Historical deposit",
            ImportId,
            Now);

        Assert.Equal(ImportId, transaction.SourceAiOrderImportId);
        Assert.Equal(Now, transaction.EvidenceReceivedAt);
        Assert.Equal(20m, transaction.Amount);
    }

    [Fact]
    public void Deposit_evidence_needs_no_timestamp_or_explicit_method()
    {
        var blockers = ValidateDepositEvidence(
            new AiOrderDepositEvidenceInput
            {
                Reference = "Counter receipt",
                AcknowledgedByAdmin = true,
            },
            deposit: 20m);

        Assert.Empty(blockers);
    }

    [Fact]
    public void Deposit_evidence_still_needs_a_reference_and_acknowledgement()
    {
        var blockers = ValidateDepositEvidence(
            new AiOrderDepositEvidenceInput(),
            deposit: 20m);

        Assert.Contains(blockers, x => x.Code == "PAYMENT_REFERENCE_REQUIRED");
        Assert.Contains(blockers, x => x.Code == "PAYMENT_ACKNOWLEDGEMENT_REQUIRED");
    }

    [Fact]
    public void Online_deposit_method_is_still_refused()
    {
        var blockers = ValidateDepositEvidence(
            new AiOrderDepositEvidenceInput
            {
                PaymentMethod = ManualPaymentMethod.Online,
                Reference = "Session",
                AcknowledgedByAdmin = true,
            },
            deposit: 20m);

        Assert.Contains(blockers, x => x.Code == "PAYMENT_METHOD_REQUIRED_FOR_DEPOSIT");
    }

    [Fact]
    public void Unpriced_ad_hoc_lines_do_not_block_the_written_total()
    {
        var blockers = ValidatePricingDecision(
            new AiOrderPricingDecisionInput { Mode = "UseWrittenTotal" },
            written: 260m,
            calculated: 0m,
            deposit: 0m);

        Assert.Empty(blockers);
    }

    [Fact]
    public void A_formal_total_must_still_be_positive_and_cover_the_deposit()
    {
        var zeroTotal = ValidatePricingDecision(
            new AiOrderPricingDecisionInput { Mode = "UseCalculatedTotal" },
            written: 260m,
            calculated: 0m,
            deposit: 0m);
        var belowDeposit = ValidatePricingDecision(
            new AiOrderPricingDecisionInput { Mode = "UseWrittenTotal" },
            written: 10m,
            calculated: 0m,
            deposit: 20m);

        Assert.Contains(zeroTotal, x => x.Code == "ORDER_TOTAL_NOT_POSITIVE");
        Assert.Contains(belowDeposit, x => x.Code == "TOTAL_BELOW_DEPOSIT");
    }

    private static List<AiOrderMaterializationBlockerDto> ValidateDepositEvidence(
        AiOrderDepositEvidenceInput? evidence,
        decimal deposit)
    {
        var blockers = new List<AiOrderMaterializationBlockerDto>();
        Invoke("ValidateDepositEvidence", [evidence, deposit, blockers]);
        return blockers;
    }

    private static List<AiOrderMaterializationBlockerDto> ValidatePricingDecision(
        AiOrderPricingDecisionInput input,
        decimal written,
        decimal calculated,
        decimal deposit)
    {
        var blockers = new List<AiOrderMaterializationBlockerDto>();
        Invoke("ValidatePricingDecision", [input, written, calculated, deposit, blockers]);
        return blockers;
    }

    private static void Invoke(string name, object?[] arguments) =>
        typeof(AiOrderConfirmationMaterializationService)
            .GetMethod(name, BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, arguments);

    private static AiOrderImport DraftImport()
    {
        var import = new AiOrderImport(
            ImportId,
            AdminId,
            "1.0",
            "create-operation",
            new string('f', 64),
            "standard");
        import.ClaimProcessingLease("lease", Now.AddMinutes(5), Now);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease", Now.AddMinutes(1));
        import.MarkDraft();
        return import;
    }

    private static AiOrderImport ConfirmedImport()
    {
        var import = DraftImport();
        import.Confirm(
            AdminId,
            1,
            new string('a', 64),
            "ai-order-staff-review-v1",
            0,
            "confirm-operation",
            Now);
        return import;
    }

    private static Order NewOrder() =>
        new(
            Guid.NewGuid(),
            "Aroha",
            "aroha@example.com",
            new ShippingAddress("Aroha", string.Empty, string.Empty, null, string.Empty, "NZ"));

    private static void AssertRoute(Type controller, string methodName, string template)
    {
        var method = controller.GetMethod(methodName)!;
        var route = method.GetCustomAttributes()
            .OfType<HttpMethodAttribute>()
            .Single();
        Assert.Equal(template, route.Template);
    }
}
