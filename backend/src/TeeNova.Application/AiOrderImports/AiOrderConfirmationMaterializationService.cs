using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.Validation;
using TeeNova.Auth;
using TeeNova.Inventory;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Data;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;

namespace TeeNova.AiOrderImports;

[Authorize(Roles = TeeNovaRoles.Admin)]
[RemoteService(false)]
public class AiOrderConfirmationMaterializationService : ApplicationService
{
    private const ManualPaymentMethod DefaultDepositPaymentMethod =
        ManualPaymentMethod.Eftpos;
    private const string DefaultWrittenTotalReason =
        "The written source total was kept; ad-hoc lines carry no catalogue price.";

    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderImportRevision, Guid> _revisions;
    private readonly IRepository<AiOrderReviewEvent, Guid> _reviewEvents;
    private readonly IRepository<Order, Guid> _orders;
    private readonly IRepository<OrderTimelineEntry, Guid> _timeline;
    private readonly IRepository<OrderPriceAdjustment, Guid> _priceAdjustments;
    private readonly IRepository<PaymentTransaction, Guid> _payments;
    private readonly AiOrderExtractionValidationProcessor _validation;
    private readonly OrderContentPricingService _pricing;
    private readonly IInventorySettingsAppService _inventorySettings;
    private readonly IUnitOfWorkManager _unitOfWorkManager;

    public AiOrderConfirmationMaterializationService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderImportRevision, Guid> revisions,
        IRepository<AiOrderReviewEvent, Guid> reviewEvents,
        IRepository<Order, Guid> orders,
        IRepository<OrderTimelineEntry, Guid> timeline,
        IRepository<OrderPriceAdjustment, Guid> priceAdjustments,
        IRepository<PaymentTransaction, Guid> payments,
        AiOrderExtractionValidationProcessor validation,
        OrderContentPricingService pricing,
        IInventorySettingsAppService inventorySettings,
        IUnitOfWorkManager unitOfWorkManager)
    {
        _imports = imports;
        _revisions = revisions;
        _reviewEvents = reviewEvents;
        _orders = orders;
        _timeline = timeline;
        _priceAdjustments = priceAdjustments;
        _payments = payments;
        _validation = validation;
        _pricing = pricing;
        _inventorySettings = inventorySettings;
        _unitOfWorkManager = unitOfWorkManager;
    }

    [UnitOfWork]
    public virtual async Task<AiOrderImportConfirmationDto> ConfirmAsync(
        Guid importId,
        ConfirmAiOrderImportInput input,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        var operationKey = Required(input.ConfirmationOperationKey, 128, "confirmation operation key");
        var operationOwner = await FindByConfirmationKeyAsync(operationKey, cancellationToken);
        if (operationOwner is not null && operationOwner.Id != importId)
            throw Conflict(
                AiOrderImportErrorCodes.ConfirmationOperationConflict,
                "The confirmation operation key belongs to another import.");

        var import = await GetTrackedImportAsync(importId, cancellationToken);
        if (import.Status == AiOrderImportStatus.Confirmed)
        {
            if (string.Equals(
                    import.ConfirmationOperationKey,
                    operationKey,
                    StringComparison.Ordinal) &&
                import.ConfirmedRevision == input.ExpectedRevision)
                return Confirmation(import);

            throw Conflict(
                AiOrderImportErrorCodes.ConfirmationOperationConflict,
                "This import is already confirmed by a different operation.");
        }

        if (import.Status != AiOrderImportStatus.Draft)
            throw new BusinessException(
                AiOrderImportErrorCodes.ConfirmationNotAllowed,
                "Only a Staff Draft can be confirmed.");
        if (input.ExpectedRevision != import.CurrentRevision)
            throw RevisionConflict(import, input.ExpectedRevision);

        var staff = await GetConfirmedStaffCandidateAsync(
            import,
            input.ExpectedRevision,
            cancellationToken);
        var root = Parse(staff.CanonicalJson);
        var readiness = await ValidateConfirmationReadinessAsync(
            import,
            staff,
            root,
            cancellationToken);
        if (readiness.Count > 0)
            throw Blocked(
                AiOrderImportErrorCodes.ConfirmationNotReady,
                "The reviewed import is not ready for confirmation.",
                readiness);

        var actor = RequireAdminId();
        var now = Clock.Now.ToUniversalTime();
        import.Confirm(
            actor,
            input.ExpectedRevision,
            staff.CanonicalSha256,
            staff.ValidationVersion,
            0,
            operationKey,
            now);

        var evidence = new JsonObject
        {
            ["confirmedRevision"] = staff.Revision,
            ["canonicalSha256"] = staff.CanonicalSha256,
            ["reviewVersion"] = staff.ValidationVersion,
            ["blockingIssueCount"] = 0,
            ["confirmedByAdminId"] = actor,
            ["confirmedAt"] = now.ToString("O", CultureInfo.InvariantCulture),
            ["confirmationOperationKey"] = operationKey,
        }.ToJsonString();
        await _reviewEvents.InsertAsync(
            new AiOrderReviewEvent(
                GuidGenerator.Create(),
                import.Id,
                staff.Revision,
                staff.Revision,
                AiOrderReviewAction.Confirmed,
                "/confirmation",
                null,
                evidence,
                "Reviewed import sealed; no formal Order created.",
                actor,
                now),
            autoSave: false,
            cancellationToken);
        await _imports.UpdateAsync(import, autoSave: false, cancellationToken);
        try
        {
            await SaveAsync(cancellationToken);
        }
        catch (AbpDbConcurrencyException)
        {
            throw Conflict(
                AiOrderImportErrorCodes.ConfirmationOperationConflict,
                "Another confirmation operation completed concurrently.");
        }
        catch (DbUpdateException exception) when (IsConfirmationRace(exception))
        {
            throw Conflict(
                AiOrderImportErrorCodes.ConfirmationOperationConflict,
                "Another confirmation operation completed concurrently.");
        }

        return Confirmation(import);
    }

    public virtual async Task<AiOrderMaterializationPreflightDto> GetPreflightAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        var import = await GetImportAsync(importId, cancellationToken);
        EnsureConfirmed(import);
        var staff = await GetSealedStaffRevisionAsync(import, cancellationToken);
        var root = Parse(staff.CanonicalJson);
        var catalogue = await _validation.LoadCatalogueAsync(cancellationToken);
        var blockers = new List<AiOrderMaterializationBlockerDto>();
        var groups = ParseGroups(root);

        if (import.FormalOrderId.HasValue)
            Add(blockers, "MATERIALIZATION_ALREADY_COMPLETED",
                "This confirmed import is already linked to a formal Order.");

        ValidateLiveCatalogue(root, groups, catalogue, blockers);
        var customerEmail = StaffString(root["customer"]?["email"]);
        if (!IsEmail(customerEmail))
            Add(blockers, "CUSTOMER_EMAIL_REQUIRED_FOR_ORDER",
                "A valid customer email is required for the current Order domain.", "/customer/email");
        Add(blockers, "FULFILMENT_METHOD_REQUIRED",
            "Choose Pickup or Shipping for formal Order creation.", "/fulfilment/deliveryMethod");
        Add(blockers, "WRITTEN_TOTAL_DECISION_REQUIRED",
            "Choose whether the formal Order uses the written total or the calculated total.",
            "/pricingDecision/mode");

        var deposit = Money(root, "depositPaid");
        if (deposit > 0)
            Add(blockers, "PAYMENT_METHOD_REQUIRED_FOR_DEPOSIT",
                "The confirmed positive deposit requires manual payment evidence.",
                "/depositEvidence");

        var written = Money(root, "orderTotal");
        decimal? catalogueTotal = null;
        if (groups.All(x => x.Mode == "Catalogue") &&
            groups.All(x => x.Printing.Count == 0) &&
            groups.SelectMany(x => x.Rows).All(x => !x.AdHocFallback) &&
            blockers.All(x => !x.Code.StartsWith("CATALOGUE_", StringComparison.Ordinal)))
        {
            try
            {
                catalogueTotal = (await _pricing.PriceAsync(
                    BuildCatalogueDraft(groups, []))).TotalAmount;
            }
            catch
            {
                Add(blockers, "CATALOGUE_SELECTION_STALE",
                    "The current catalogue selection cannot be priced safely.");
            }
        }

        return new AiOrderMaterializationPreflightDto
        {
            ImportId = import.Id,
            ConfirmedRevision = import.ConfirmedRevision!.Value,
            ConfirmedCanonicalSha256 = import.ConfirmedCanonicalSha256!,
            ProductGroups = groups.Select(ToDto).ToArray(),
            CatalogueStatus = blockers.Any(x => x.Code.StartsWith("CATALOGUE_", StringComparison.Ordinal))
                ? "Stale"
                : "Current",
            WrittenOrderTotal = Cents(written),
            DepositPaid = Cents(deposit),
            CalculatedCatalogueTotal = catalogueTotal.HasValue ? Cents(catalogueTotal.Value) : null,
            PricingStatus = catalogueTotal.HasValue ? "CalculatedCatalogueTotalAvailable" : "DecisionRequired",
            PaymentEvidenceRequired = deposit > 0,
            ProposedInitialOrderStatus = OrderStatus.Pending.ToString(),
            Blockers = blockers,
            CanMaterialize = blockers.Count == 0,
            AlreadyMaterialized = import.FormalOrderId.HasValue,
            FormalOrderId = import.FormalOrderId,
        };
    }

    [UnitOfWork]
    public virtual async Task<AiOrderMaterializationResultDto> MaterializeAsync(
        Guid importId,
        MaterializeAiOrderImportInput input,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        var operationKey = Required(input.MaterializationOperationKey, 128, "materialization operation key");
        var requestHash = RequestHash(importId, input);
        var import = await GetTrackedImportAsync(importId, cancellationToken);
        EnsureConfirmed(import);

        var operationOwner = await FindByMaterializationKeyAsync(operationKey, cancellationToken);
        if (operationOwner is not null && operationOwner.Id != importId)
            throw Conflict(
                AiOrderImportErrorCodes.MaterializationOperationConflict,
                "The materialization operation key belongs to another import.");

        if (import.FormalOrderId.HasValue)
        {
            if (string.Equals(import.MaterializationOperationKey, operationKey, StringComparison.Ordinal) &&
                string.Equals(import.MaterializationRequestHash, requestHash, StringComparison.Ordinal))
            {
                var existing = await _orders.GetAsync(import.FormalOrderId.Value, cancellationToken: cancellationToken);
                return Result(import, existing, true, paymentCreated: import.ConfirmedRevision.HasValue &&
                    await _payments.AnyAsync(
                        x => x.SourceAiOrderImportId == import.Id,
                        cancellationToken));
            }

            throw Conflict(
                AiOrderImportErrorCodes.MaterializationAlreadyCompleted,
                "This import has already created a formal Order.");
        }

        if (input.ConfirmedRevision != import.ConfirmedRevision)
            throw Conflict(
                AiOrderImportErrorCodes.ReviewRevisionConflict,
                "The confirmed revision does not match the sealed import.");
        if (!string.Equals(input.NotificationPolicy, "DoNotSend", StringComparison.Ordinal))
            throw Invalid("NotificationPolicy must be DoNotSend for Jira 10207.");
        if (string.Equals(input.PricingDecision.Mode, "RejectAndReturnToReview", StringComparison.Ordinal))
        {
            return new AiOrderMaterializationResultDto
            {
                ImportId = import.Id,
                Created = false,
                Outcome = "RejectedNoOrderCreated",
                PricingMode = input.PricingDecision.Mode,
                EmailSent = false,
                InventoryChanged = false,
                ProductionWorkCreated = false,
                ProductionPdfGenerated = false,
            };
        }

        var staff = await GetSealedStaffRevisionAsync(import, cancellationToken);
        var root = Parse(staff.CanonicalJson);
        var catalogue = await _validation.LoadCatalogueAsync(cancellationToken);
        var groups = ParseGroups(root);
        var blockers = new List<AiOrderMaterializationBlockerDto>();
        ValidateLiveCatalogue(root, groups, catalogue, blockers);
        ValidateCustomerAndFulfilment(input, blockers);

        var writtenTotal = Money(root, "orderTotal");
        var deposit = Money(root, "depositPaid");
        var adHocPrices = ParseAdHocPrices(input.AdHocPricing, groups, blockers);
        var printSelections = ParsePrintSelections(input.CataloguePrinting, groups, blockers);

        PricedOrderDraft? pricedCatalogue = null;
        try
        {
            if (!blockers.Any(x =>
                    x.Code.StartsWith("CATALOGUE_PRINT_", StringComparison.Ordinal)))
            {
                var draft = BuildCatalogueDraft(groups, printSelections);
                if (draft.Count > 0)
                    pricedCatalogue = await _pricing.PriceAsync(draft);
            }
        }
        catch (Exception exception) when (
            exception is BusinessException or Volo.Abp.Domain.Entities.EntityNotFoundException)
        {
            Add(blockers, "CATALOGUE_SELECTION_STALE",
                "A selected catalogue product, variant, or print option is no longer valid.");
        }

        var adHocTotal = groups
            .SelectMany(AdHocRows)
            .Sum(x => adHocPrices.GetValueOrDefault((x.GroupId, x.RowId)) * x.Quantity);
        var calculatedTotal = (pricedCatalogue?.TotalAmount ?? 0m) + adHocTotal;
        ValidatePricingDecision(
            input.PricingDecision,
            writtenTotal,
            calculatedTotal,
            deposit,
            blockers);
        ValidateDepositEvidence(input.DepositEvidence, deposit, blockers);

        if (blockers.Count > 0)
            throw Blocked(
                AiOrderImportErrorCodes.MaterializationBlocked,
                "Formal Order creation is blocked until all operational prerequisites are complete.",
                blockers);

        var actor = RequireAdminId();
        var now = Clock.Now.ToUniversalTime();
        var finalTotal = input.PricingDecision.Mode == "UseWrittenTotal"
            ? writtenTotal
            : calculatedTotal;
        var addressInput = input.Fulfilment.ShippingAddress;
        var customerName = string.IsNullOrWhiteSpace(input.Customer.Name)
            ? input.Customer.Email.Trim()
            : input.Customer.Name.Trim();
        var address = new ShippingAddress(
            addressInput?.FullName?.Trim() ?? customerName,
            addressInput?.AddressLine1?.Trim() ?? string.Empty,
            addressInput?.City?.Trim() ?? string.Empty,
            addressInput?.State?.Trim(),
            addressInput?.PostalCode?.Trim() ?? string.Empty,
            string.IsNullOrWhiteSpace(addressInput?.Country)
                ? "NZ"
                : addressInput.Country.Trim(),
            addressInput?.AddressLine2?.Trim(),
            addressInput?.Phone?.Trim());
        var order = new Order(
            GuidGenerator.Create(),
            customerName,
            input.Customer.Email.Trim(),
            address)
        {
            DeliveryMethod = input.Fulfilment.DeliveryMethod,
            Notes = $"Created from confirmed AI Order Import {import.Id}.",
        };
        order.MarkCreatedFromAiImport(
            import.Id,
            import.ConfirmedRevision!.Value,
            import.ConfirmedCanonicalSha256!,
            import.ConfirmedByAdminId!.Value,
            import.ConfirmedAt!.Value,
            operationKey,
            actor,
            now,
            writtenTotal,
            calculatedTotal,
            input.PricingDecision.Mode,
            input.PricingDecision.Reason);

        var inventoryEligible =
            (await _inventorySettings.GetAsync()).AutoDeductOnPressedEnabled;
        var pricedItems = pricedCatalogue?.Items ?? [];
        var pricedIndex = 0;
        foreach (var group in groups)
        {
            if (group.Mode == "Catalogue")
            {
                foreach (var row in group.Rows.Where(x => !x.AdHocFallback))
                {
                    var priced = pricedItems[pricedIndex++];
                    order.AddItem(BuildCatalogueItem(
                        order.Id,
                        priced,
                        inventoryEligible,
                        row.Colour,
                        row.Size));
                }
            }

            // A catalogue group contributes ad-hoc lines only for the sizes its product
            // cannot supply; an ad-hoc group contributes all of its rows.
            var adHocRows = AdHocRows(group);
            if (adHocRows.Count == 0)
                continue;

            var adHoc = group.AdHoc ?? new ReviewAdHoc(group.Name, null, null, null, null);
            var snapshot = new OrderAdHocProductSnapshot(
                GuidGenerator.Create(),
                order.Id,
                adHoc.DisplayName,
                group.WrittenName,
                adHoc.Brand,
                adHoc.SupplierName,
                adHoc.SupplierCode,
                adHoc.SupplySource,
                group.GroupId,
                import.ConfirmedRevision.Value,
                group.Printing.Count == 0
                    ? null
                    : JsonSerializer.Serialize(group.Printing));
            order.AddAdHocProductSnapshot(snapshot);
            foreach (var row in adHocRows)
            {
                order.AddItem(OrderItem.CreateAdHoc(
                    GuidGenerator.Create(),
                    order.Id,
                    snapshot.Id,
                    adHoc.DisplayName,
                    row.Colour,
                    row.Size,
                    row.Quantity,
                    adHocPrices.GetValueOrDefault((group.GroupId, row.RowId))));
            }
        }

        order.InitializePaymentRequirement();
        OrderPriceAdjustment? adjustment = null;
        if (input.PricingDecision.Mode == "UseWrittenTotal" &&
            writtenTotal != calculatedTotal)
        {
            order.AdjustPrice(writtenTotal, now);
            adjustment = new OrderPriceAdjustment(
                GuidGenerator.Create(),
                order.Id,
                calculatedTotal,
                writtenTotal,
                string.IsNullOrWhiteSpace(input.PricingDecision.Reason)
                    ? DefaultWrittenTotalReason
                    : Required(input.PricingDecision.Reason, 1000, "pricing reason"),
                actor.ToString());
        }

        PaymentTransaction? payment = null;
        if (deposit > 0)
        {
            var evidence = input.DepositEvidence!;
            // The deposit is historical; when its exact time was not recorded, the
            // materialization time stands in for it.
            var method = evidence.PaymentMethod ?? DefaultDepositPaymentMethod;
            var receivedAt = evidence.ReceivedAt?.ToUniversalTime() ?? now;
            order.ApplyPayment(
                deposit,
                method,
                evidence.Reference!.Trim(),
                $"Deposit evidenced from AI Order Import {import.Id}.",
                now);
            payment = new PaymentTransaction(
                GuidGenerator.Create(),
                order.Id,
                deposit,
                method,
                evidence.Reference.Trim(),
                "Historical deposit recorded during explicit AI import materialization.",
                import.Id,
                receivedAt);
        }

        await _orders.InsertAsync(order, autoSave: false, cancellationToken);
        if (adjustment is not null)
            await _priceAdjustments.InsertAsync(adjustment, autoSave: false, cancellationToken);
        if (payment is not null)
            await _payments.InsertAsync(payment, autoSave: false, cancellationToken);
        await _timeline.InsertAsync(
            new OrderTimelineEntry(
                GuidGenerator.Create(),
                order.Id,
                OrderEventType.AiOrderImportMaterialized,
                $"Created from AI Order Import {import.Id}; confirmed revision {import.ConfirmedRevision}. No notification, inventory, production job, or PDF action was triggered.",
                OrderStatus.Pending),
            autoSave: false,
            cancellationToken);
        if (payment is not null)
        {
            await _timeline.InsertAsync(
                new OrderTimelineEntry(
                    GuidGenerator.Create(),
                    order.Id,
                    OrderEventType.PaymentReceived,
                    $"Historical deposit of {deposit:F2} NZD recorded from confirmed import evidence.",
                    OrderStatus.Pending),
                autoSave: false,
                cancellationToken);
        }

        import.LinkFormalOrder(order.Id, operationKey, requestHash, actor, now);
        await _imports.UpdateAsync(import, autoSave: false, cancellationToken);
        try
        {
            await SaveAsync(cancellationToken);
        }
        catch (AbpDbConcurrencyException)
        {
            throw Conflict(
                AiOrderImportErrorCodes.MaterializationOperationConflict,
                "Another materialization operation completed concurrently.");
        }
        catch (DbUpdateException exception) when (IsMaterializationRace(exception))
        {
            throw Conflict(
                AiOrderImportErrorCodes.MaterializationOperationConflict,
                "Another materialization operation completed concurrently.");
        }

        return Result(import, order, false, payment is not null);
    }

    private async Task<IReadOnlyList<AiOrderMaterializationBlockerDto>>
        ValidateConfirmationReadinessAsync(
            AiOrderImport import,
            AiOrderImportRevision staff,
            JsonObject root,
            CancellationToken cancellationToken)
    {
        var blockers = new List<AiOrderMaterializationBlockerDto>();
        var computedHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(staff.CanonicalJson))).ToLowerInvariant();
        if (!string.Equals(computedHash, staff.CanonicalSha256, StringComparison.Ordinal))
            Add(blockers, "CANONICAL_HASH_MISMATCH",
                "The Staff revision bytes do not match their stored hash.");
        if (staff.Source != AiOrderRevisionSource.Staff ||
            staff.ValidationVersion != AiOrderStaffReviewVersions.Review ||
            root["reviewVersion"]?.GetValue<string>() != AiOrderStaffReviewVersions.Review)
            Add(blockers, "STAFF_REVIEW_VERSION_UNSUPPORTED",
                "The latest revision is not a supported Staff Review.");
        if (root["revision"]?.GetValue<int>() != import.CurrentRevision)
            Add(blockers, "STAFF_REVIEW_REVISION_MISMATCH",
                "The canonical Staff revision identity is stale.");

        var issues = root["issues"] as JsonArray ?? [];
        if (issues.OfType<JsonObject>().Any(x =>
                x["severity"]?.GetValue<string>() == "Blocking" &&
                x["resolution"]?["status"]?.GetValue<string>() == "Open"))
            Add(blockers, "OPEN_BLOCKING_ISSUES",
                "All blocking review issues must be resolved.");

        var catalogue = await _validation.LoadCatalogueAsync(cancellationToken);
        var currentFingerprint =
            AiOrderExtractionNormalizer.CreateCatalogueFingerprint(catalogue);
        if (!string.Equals(
                currentFingerprint,
                root["catalogueFingerprint"]?.GetValue<string>(),
                StringComparison.Ordinal))
            Add(blockers, "CATALOGUE_SELECTION_STALE",
                "Catalogue data changed after the Staff Draft was saved.");

        var groups = ParseGroups(root, blockers);
        ValidateLiveCatalogue(root, groups, catalogue, blockers);
        try
        {
            var total = Money(root, "orderTotal");
            var deposit = Money(root, "depositPaid");
            if (deposit > total)
                Add(blockers, "DEPOSIT_EXCEEDS_TOTAL",
                    "Deposit Paid must not exceed Order Total.");
            var expectedBalance = total - deposit;
            var balanceText = root["financials"]?["balanceDue"]?["amount"]?.GetValue<string>();
            if (!TryCents(balanceText, out var balance) || balance != expectedBalance)
                Add(blockers, "BALANCE_DERIVATION_INVALID",
                    "Balance Due must be derived exactly from Order Total minus Deposit Paid.");
        }
        catch (BusinessException)
        {
            Add(blockers, "FINANCIAL_REQUIRED_FIELDS_INVALID",
                "Order Total and Deposit Paid must be present as exact non-negative cents.");
        }
        return blockers;
    }

    private static void ValidateLiveCatalogue(
        JsonObject root,
        IReadOnlyList<ReviewGroup> groups,
        IReadOnlyList<AiOrderCatalogueProductSnapshot> catalogue,
        ICollection<AiOrderMaterializationBlockerDto> blockers)
    {
        var fingerprint = AiOrderExtractionNormalizer.CreateCatalogueFingerprint(catalogue);
        if (!string.Equals(
                fingerprint,
                root["catalogueFingerprint"]?.GetValue<string>(),
                StringComparison.Ordinal))
            Add(blockers, "CATALOGUE_SELECTION_STALE",
                "Catalogue data changed after confirmation.");

        foreach (var group in groups.Where(x => x.Mode == "Catalogue"))
        {
            var product = catalogue.SingleOrDefault(x => x.Id == group.ProductId);
            if (product is null || !product.IsActive)
            {
                Add(blockers, "CATALOGUE_PRODUCT_INACTIVE",
                    $"Catalogue product for {group.Name} is missing or inactive.");
                continue;
            }
            if (!string.Equals(product.Kind.ToString(), group.ProductKind, StringComparison.Ordinal) ||
                !string.Equals(product.PricingModel.ToString(), group.PricingModel, StringComparison.Ordinal))
            {
                Add(blockers, "CATALOGUE_SELECTION_STALE",
                    $"Catalogue product type or pricing model changed for {group.Name}.");
            }
            foreach (var row in group.Rows)
            {
                if (product.Kind != TeeNova.Catalog.ProductKind.Garment ||
                    row.AdHocFallback)
                    continue;
                var variant = product.Variants.SingleOrDefault(x => x.Id == row.VariantId);
                if (variant is null || !variant.IsAvailable ||
                    !Same(variant.Colour, row.Colour) ||
                    !Same(variant.Size, row.Size))
                    Add(blockers, "CATALOGUE_VARIANT_UNAVAILABLE",
                        $"The confirmed variant for {group.Name}, {row.Colour} / {row.Size}, is unavailable or changed.");
            }
        }
    }

    private static void ValidateCustomerAndFulfilment(
        MaterializeAiOrderImportInput input,
        ICollection<AiOrderMaterializationBlockerDto> blockers)
    {
        if (!IsEmail(input.Customer.Email))
            Add(blockers, "CUSTOMER_EMAIL_REQUIRED_FOR_ORDER",
                "A valid customer email is required.", "/customer/email");
        if (!input.Fulfilment.DeliveryMethod.HasValue)
        {
            Add(blockers, "FULFILMENT_METHOD_REQUIRED",
                "A fulfilment method is required.", "/fulfilment/deliveryMethod");
            return;
        }
        if (input.Fulfilment.DeliveryMethod == DeliveryMethod.Shipping)
        {
            var address = input.Fulfilment.ShippingAddress;
            if (address is null ||
                string.IsNullOrWhiteSpace(address.FullName) ||
                string.IsNullOrWhiteSpace(address.AddressLine1) ||
                string.IsNullOrWhiteSpace(address.City) ||
                string.IsNullOrWhiteSpace(address.PostalCode) ||
                string.IsNullOrWhiteSpace(address.Country))
                Add(blockers, "SHIPPING_ADDRESS_REQUIRED",
                    "Shipping requires a complete delivery address.", "/fulfilment/shippingAddress");
        }
    }

    // Ad-hoc lines carry no catalogue price. An operator-supplied price is honoured, and
    // anything left unpriced is recorded at 0.00 with the written total carrying the money.
    private static Dictionary<(string GroupId, string RowId), decimal> ParseAdHocPrices(
        IReadOnlyList<AiOrderAdHocPriceInput> inputs,
        IReadOnlyList<ReviewGroup> groups,
        ICollection<AiOrderMaterializationBlockerDto> blockers)
    {
        var expected = groups
            .SelectMany(g => AdHocRows(g).Select(r => (g.GroupId, r.RowId)))
            .ToHashSet();
        var result = new Dictionary<(string, string), decimal>();
        foreach (var input in inputs)
        {
            var key = (input.GroupId.Trim(), input.RowId.Trim());
            if (string.IsNullOrWhiteSpace(input.UnitPrice) || !expected.Contains(key))
                continue;
            if (result.ContainsKey(key) ||
                !TryCents(input.UnitPrice, out var amount) || amount < 0)
            {
                Add(blockers, "AD_HOC_LINE_PRICE_INVALID",
                    "An ad-hoc unit price must be one exact, non-negative amount.");
                continue;
            }
            result[key] = amount;
        }
        return result;
    }

    private static IReadOnlyList<AiOrderCataloguePrintSelectionInput> ParsePrintSelections(
        IReadOnlyList<AiOrderCataloguePrintSelectionInput> inputs,
        IReadOnlyList<ReviewGroup> groups,
        ICollection<AiOrderMaterializationBlockerDto> blockers)
    {
        var expected = groups
            .Where(x => x.Mode == "Catalogue")
            .SelectMany(g => g.Printing.Select(p => (g.GroupId, p.PrintId)))
            .ToHashSet();
        var actual = new HashSet<(string, string)>();
        var valid = new List<AiOrderCataloguePrintSelectionInput>();
        foreach (var input in inputs)
        {
            var key = (input.GroupId.Trim(), input.PrintId.Trim());
            if (!expected.Contains(key) || !actual.Add(key) ||
                input.PrintAreaId == Guid.Empty || input.PrintSizeId == Guid.Empty)
            {
                Add(blockers, "CATALOGUE_PRINT_SELECTION_INVALID",
                    "Every reviewed catalogue print requires one explicit area and size selection.");
                continue;
            }
            valid.Add(input);
        }
        foreach (var key in expected.Where(x => !actual.Contains(x)))
            Add(blockers, "CATALOGUE_PRINT_SELECTION_REQUIRED",
                $"Print selection {key.PrintId} requires a catalogue area and size.");
        return valid;
    }

    private static void ValidatePricingDecision(
        AiOrderPricingDecisionInput input,
        decimal written,
        decimal calculated,
        decimal deposit,
        ICollection<AiOrderMaterializationBlockerDto> blockers)
    {
        if (input.Mode is not ("UseCalculatedTotal" or "UseWrittenTotal"))
            Add(blockers, "WRITTEN_TOTAL_DECISION_REQUIRED",
                "Choose UseCalculatedTotal or UseWrittenTotal.");
        var final = input.Mode == "UseWrittenTotal" ? written : calculated;
        if (final <= 0)
            Add(blockers, "ORDER_TOTAL_NOT_POSITIVE",
                "The current Order domain requires a positive formal total.");
        if (final < deposit)
            Add(blockers, "TOTAL_BELOW_DEPOSIT",
                "The selected formal total cannot be below Deposit Paid.");
    }

    private static void ValidateDepositEvidence(
        AiOrderDepositEvidenceInput? evidence,
        decimal deposit,
        ICollection<AiOrderMaterializationBlockerDto> blockers)
    {
        if (deposit == 0)
        {
            if (evidence is not null &&
                (evidence.PaymentMethod.HasValue ||
                 !string.IsNullOrWhiteSpace(evidence.Reference) ||
                 evidence.ReceivedAt.HasValue))
                Add(blockers, "ZERO_DEPOSIT_MUST_NOT_CREATE_PAYMENT",
                    "A zero deposit must not include payment evidence.");
            return;
        }
        // An absent method means the operator accepted the default; only an explicitly
        // online method is refused, because no provider session is created here.
        if (evidence?.PaymentMethod == ManualPaymentMethod.Online)
            Add(blockers, "PAYMENT_METHOD_REQUIRED_FOR_DEPOSIT",
                "Online provider sessions are not created during materialization.");
        if (string.IsNullOrWhiteSpace(evidence?.Reference))
            Add(blockers, "PAYMENT_REFERENCE_REQUIRED",
                "A payment reference is required.");
        if (evidence?.AcknowledgedByAdmin != true)
            Add(blockers, "PAYMENT_ACKNOWLEDGEMENT_REQUIRED",
                "The materializing Admin must acknowledge the deposit evidence.");
    }

    private static IReadOnlyList<ReviewRow> AdHocRows(ReviewGroup group) =>
        group.Mode == "Catalogue"
            ? group.Rows.Where(x => x.AdHocFallback).ToArray()
            : group.Rows;

    private static List<OrderDraftItem> BuildCatalogueDraft(
        IReadOnlyList<ReviewGroup> groups,
        IReadOnlyList<AiOrderCataloguePrintSelectionInput> printSelections)
    {
        var selections = printSelections.ToDictionary(
            x => (x.GroupId.Trim(), x.PrintId.Trim()));
        var draft = new List<OrderDraftItem>();
        foreach (var group in groups.Where(x => x.Mode == "Catalogue"))
        {
            var prints = group.Printing.Select(p =>
            {
                var selection = selections[(group.GroupId, p.PrintId)];
                return new OrderDraftPrint(
                    null,
                    selection.PrintAreaId,
                    selection.PrintSizeId,
                    null,
                    null,
                    p.DesignNote,
                    p.Notes);
            }).ToArray();
            foreach (var row in group.Rows.Where(x => !x.AdHocFallback))
            {
                draft.Add(new OrderDraftItem(
                    null,
                    group.ProductId!.Value,
                    row.VariantId,
                    row.Quantity,
                    prints,
                    DesignNote: group.ProductionNotes));
            }
        }
        return draft;
    }

    private OrderItem BuildCatalogueItem(
        Guid orderId,
        PricedOrderItem priced,
        bool inventoryEligible,
        string colour,
        string size)
    {
        var item = new OrderItem(
            GuidGenerator.Create(),
            orderId,
            priced.ProductId,
            priced.ProductVariantId,
            priced.ProductName,
            priced.VariantLabel,
            priced.Quantity,
            priced.UnitPrice)
        {
            InventoryDeductionEligible = inventoryEligible,
            PricingModel = priced.PricingModel,
            ProductKind = priced.ProductKind,
            UploadedAssetId = priced.UploadedAssetId,
            UploadedAssetUrl = priced.UploadedAssetUrl,
            DesignNote = priced.DesignNote,
            AppliedQuantityTierMinQuantity = priced.AppliedQuantityTierMinQuantity,
            ConfigurationJson = priced.ConfigurationJson,
        };
        item.SetCatalogueVariantSnapshots(colour, size);
        foreach (var print in priced.Prints)
        {
            item.AddPrint(
                GuidGenerator.Create(),
                print.PrintAreaId,
                print.PrintAreaName,
                print.PrintAreaCode,
                print.PrintAreaPrice,
                print.PrintSizeId,
                print.PrintSizeName,
                print.PrintSizeCode,
                print.PrintSizePrice,
                print.ResolvedUnitPrintPrice,
                print.AppliedPrintTierMinQuantity,
                print.SortOrder,
                print.PrintNotes,
                print.UploadedAssetId,
                print.UploadedAssetUrl,
                print.DesignNote);
        }
        return item;
    }

    private static IReadOnlyList<ReviewGroup> ParseGroups(
        JsonObject root,
        ICollection<AiOrderMaterializationBlockerDto>? blockers = null)
    {
        var result = new List<ReviewGroup>();
        var groups = root["productGroups"] as JsonArray ?? [];
        foreach (var (node, index) in groups.OfType<JsonObject>().Select((x, i) => (x, i)))
        {
            var path = $"/productGroups/{index}";
            var groupId = node["groupId"]?.GetValue<string>() ?? string.Empty;
            var selection = node["productSelection"] as JsonObject ?? new JsonObject();
            var mode = selection["mode"]?.GetValue<string>() ?? "Unresolved";
            var colour = ControlledLabel(node["colour"]);
            var rows = new List<ReviewRow>();
            foreach (var rowNode in (node["sizeQuantityRows"] as JsonArray ?? []).OfType<JsonObject>())
            {
                var rowId = rowNode["rowId"]?.GetValue<string>() ?? string.Empty;
                var size = ControlledLabel(rowNode["size"]);
                var quantity = rowNode["quantity"]?["staffValue"]?.GetValue<int?>();
                var variant = rowNode["confirmedProductVariantId"]?.GetValue<Guid?>();
                var adHocFallback = rowNode["adHocFallback"]?.GetValue<bool?>() == true;
                if (string.IsNullOrWhiteSpace(rowId) || string.IsNullOrWhiteSpace(size) ||
                    string.IsNullOrWhiteSpace(colour) || quantity is null or <= 0)
                {
                    Add(blockers, "CONFIRMED_REQUIRED_FIELD_INVALID",
                        "Product, Colour, Size, and Quantity must be valid.", path);
                    continue;
                }
                rows.Add(new ReviewRow(
                    groupId,
                    rowId,
                    colour,
                    size,
                    quantity.Value,
                    adHocFallback ? null : variant,
                    adHocFallback));
            }

            var selected = selection["selectedCatalogueProduct"] as JsonObject;
            ReviewAdHoc? adHoc = null;
            if (mode == "AdHoc" && selection["adHocProduct"] is JsonObject a)
            {
                if (a["confirmed"]?.GetValue<bool>() != true ||
                    a["acknowledgedOrderOnly"]?.GetValue<bool>() != true ||
                    string.IsNullOrWhiteSpace(a["displayName"]?.GetValue<string>()))
                    Add(blockers, "AD_HOC_PRODUCT_CONFIRMATION_REQUIRED",
                        "The Ad-hoc Product snapshot is not explicitly confirmed.", path);
                else
                    adHoc = new ReviewAdHoc(
                        a["displayName"]!.GetValue<string>(),
                        a["brand"]?.GetValue<string?>(),
                        a["supplierName"]?.GetValue<string?>(),
                        a["supplierCode"]?.GetValue<string?>(),
                        a["supplySource"]?.GetValue<string?>());
            }
            if (mode is not ("Catalogue" or "AdHoc"))
                Add(blockers, "PRODUCT_UNRESOLVED",
                    "Every group must use a confirmed catalogue or Ad-hoc Product.", path);

            var printing = (node["printing"] as JsonArray ?? [])
                .OfType<JsonObject>()
                .Select(x => new ReviewPrint(
                    x["printId"]?.GetValue<string>() ?? string.Empty,
                    StaffString(x["position"]),
                    StaffString(x["printSize"]),
                    StaffString(x["notes"]),
                    StaffString(node["artworkIdentity"])))
                .Where(x => !string.IsNullOrWhiteSpace(x.Position) ||
                            !string.IsNullOrWhiteSpace(x.PrintSize) ||
                            !string.IsNullOrWhiteSpace(x.Notes))
                .ToArray();
            result.Add(new ReviewGroup(
                groupId,
                mode,
                StaffString(node["writtenProductName"]) ??
                    selected?["productName"]?.GetValue<string>() ??
                    adHoc?.DisplayName ??
                    "Product",
                selected?["productName"]?.GetValue<string>() ??
                    adHoc?.DisplayName ??
                    "Product",
                selected?["productId"]?.GetValue<Guid?>(),
                selected?["productKind"]?.GetValue<string>(),
                selected?["pricingModel"]?.GetValue<string>(),
                adHoc,
                rows,
                printing,
                StaffString(node["productionNotes"])));
        }
        if (result.Count == 0)
            Add(blockers, "PRODUCT_MISSING", "At least one product group is required.");
        return result;
    }

    private async Task<AiOrderImportRevision> GetConfirmedStaffCandidateAsync(
        AiOrderImport import,
        int expectedRevision,
        CancellationToken cancellationToken)
    {
        var query = await _revisions.GetQueryableAsync();
        return await query.AsNoTracking().SingleOrDefaultAsync(
                   x => x.ImportId == import.Id &&
                        x.Revision == expectedRevision &&
                        x.Source == AiOrderRevisionSource.Staff,
                   cancellationToken)
               ?? throw new BusinessException(
                   AiOrderImportErrorCodes.ConfirmationNotReady,
                   "The current revision is not a Staff Review.");
    }

    private async Task<AiOrderImportRevision> GetSealedStaffRevisionAsync(
        AiOrderImport import,
        CancellationToken cancellationToken)
    {
        var revision = await GetConfirmedStaffCandidateAsync(
            import,
            import.ConfirmedRevision!.Value,
            cancellationToken);
        if (!string.Equals(
                revision.CanonicalSha256,
                import.ConfirmedCanonicalSha256,
                StringComparison.Ordinal) ||
            !string.Equals(
                revision.ValidationVersion,
                import.ConfirmedReviewVersion,
                StringComparison.Ordinal))
            throw new BusinessException(
                AiOrderImportErrorCodes.MaterializationNotAllowed,
                "The sealed confirmation evidence does not match the immutable Staff revision.");
        return revision;
    }

    private async Task<AiOrderImport?> FindByConfirmationKeyAsync(
        string key,
        CancellationToken cancellationToken)
    {
        var query = await _imports.GetQueryableAsync();
        return await query.AsNoTracking().SingleOrDefaultAsync(
            x => x.ConfirmationOperationKey == key,
            cancellationToken);
    }

    private async Task<AiOrderImport?> FindByMaterializationKeyAsync(
        string key,
        CancellationToken cancellationToken)
    {
        var query = await _imports.GetQueryableAsync();
        return await query.AsNoTracking().SingleOrDefaultAsync(
            x => x.MaterializationOperationKey == key,
            cancellationToken);
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

    private async Task<AiOrderImport> GetTrackedImportAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        var query = await _imports.GetQueryableAsync();
        return await query.SingleOrDefaultAsync(x => x.Id == importId, cancellationToken)
               ?? throw new BusinessException(AiOrderImportErrorCodes.ImportNotFound);
    }

    private static void EnsureConfirmed(AiOrderImport import)
    {
        if (import.Status != AiOrderImportStatus.Confirmed ||
            !import.ConfirmedRevision.HasValue ||
            string.IsNullOrWhiteSpace(import.ConfirmedCanonicalSha256))
            throw new BusinessException(
                AiOrderImportErrorCodes.MaterializationNotAllowed,
                "Formal materialization requires a confirmed immutable import.");
    }

    private Guid RequireAdminId() =>
        CurrentUser.Id ??
        throw new BusinessException(
            AiOrderImportErrorCodes.InvalidRequest,
            "The authenticated Admin identity is unavailable.");

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        if (_unitOfWorkManager.Current is not null)
            await _unitOfWorkManager.Current.SaveChangesAsync(cancellationToken);
    }

    private static AiOrderImportConfirmationDto Confirmation(AiOrderImport import) => new()
    {
        ImportId = import.Id,
        Status = import.Status,
        ConfirmedRevision = import.ConfirmedRevision!.Value,
        ConfirmedCanonicalSha256 = import.ConfirmedCanonicalSha256!,
        ReviewVersion = import.ConfirmedReviewVersion!,
        ConfirmedByAdminId = import.ConfirmedByAdminId!.Value,
        ConfirmedAt = import.ConfirmedAt!.Value,
        BlockingIssueCount = import.ConfirmedBlockingIssueCount ?? 0,
        FormalOrderCreated = import.FormalOrderId.HasValue,
        FormalOrderId = import.FormalOrderId,
    };

    private static AiOrderMaterializationResultDto Result(
        AiOrderImport import,
        Order order,
        bool replay,
        bool paymentCreated) => new()
    {
        ImportId = import.Id,
        Created = true,
        WasIdempotentReplay = replay,
        Outcome = replay ? "ExistingOrderReturned" : "FormalOrderCreated",
        OrderId = order.Id,
        OrderNumber = order.OrderNumber,
        OrderStatus = order.Status,
        PaymentStatus = order.PaymentStatus,
        PricingMode = order.AiPricingMode ?? string.Empty,
        WrittenOrderTotal = Cents(order.AiWrittenOrderTotal ?? 0m),
        CalculatedMaterializationTotal = Cents(order.AiCalculatedMaterializationTotal ?? 0m),
        FinalOrderTotal = Cents(order.TotalAmount),
        DepositPaid = Cents(order.PaidAmount),
        PaymentTransactionCreated = paymentCreated,
        EmailSent = false,
        InventoryChanged = false,
        ProductionWorkCreated = false,
        ProductionPdfGenerated = false,
    };

    private static AiOrderMaterializationGroupDto ToDto(ReviewGroup group) => new()
    {
        GroupId = group.GroupId,
        ProductSource = group.Mode,
        ProductName = group.Name,
        CatalogueProductId = group.ProductId,
        Rows = group.Rows.Select(x => new AiOrderMaterializationRowDto
        {
            RowId = x.RowId,
            Colour = x.Colour,
            Size = x.Size,
            Quantity = x.Quantity,
            CatalogueVariantId = x.VariantId,
            AdHocFallback = x.AdHocFallback,
        }).ToArray(),
    };

    private static JsonObject Parse(string json) =>
        JsonNode.Parse(json) as JsonObject ??
        throw new BusinessException(
            AiOrderImportErrorCodes.ReviewDocumentInvalid,
            "The Staff Review canonical document is invalid.");

    private static decimal Money(JsonObject root, string name)
    {
        var value = root["financials"]?[name]?["staffValue"]?.GetValue<string>();
        if (!TryCents(value, out var amount) || amount < 0)
            throw Invalid($"{name} must be an exact non-negative cents value.");
        return amount;
    }

    private static bool TryCents(string? value, out decimal amount) =>
        decimal.TryParse(
            value,
            NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture,
            out amount) &&
        amount == decimal.Round(amount, 2, MidpointRounding.AwayFromZero);

    private static string Cents(decimal amount) =>
        amount.ToString("0.00", CultureInfo.InvariantCulture);

    private static string? StaffString(JsonNode? field) =>
        field?["staffValue"]?.GetValue<string?>();

    private static string ControlledLabel(JsonNode? field) =>
        field?["staffValue"]?["label"]?.GetValue<string?>()?.Trim() ?? string.Empty;

    private static bool IsEmail(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        new EmailAddressAttribute().IsValid(value.Trim());

    private static bool Same(string left, string right) =>
        string.Equals(
            AiOrderTextNormalization.NormalizeComparison(left),
            AiOrderTextNormalization.NormalizeComparison(right),
            StringComparison.Ordinal);

    private static string Required(string? value, int maximumLength, string name)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > maximumLength)
            throw Invalid($"A non-empty {name} of at most {maximumLength} characters is required.");
        return normalized;
    }

    private static string RequestHash(Guid importId, MaterializeAiOrderImportInput input)
    {
        var json = new JsonObject
        {
            ["version"] = "ai-order-materialization-request-v1",
            ["importId"] = importId,
            ["confirmedRevision"] = input.ConfirmedRevision,
            ["customer"] = JsonSerializer.SerializeToNode(input.Customer),
            ["fulfilment"] = JsonSerializer.SerializeToNode(input.Fulfilment),
            ["pricingDecision"] = JsonSerializer.SerializeToNode(input.PricingDecision),
            ["adHocPricing"] = JsonSerializer.SerializeToNode(input.AdHocPricing
                .OrderBy(x => x.GroupId, StringComparer.Ordinal)
                .ThenBy(x => x.RowId, StringComparer.Ordinal)),
            ["cataloguePrinting"] = JsonSerializer.SerializeToNode(input.CataloguePrinting
                .OrderBy(x => x.GroupId, StringComparer.Ordinal)
                .ThenBy(x => x.PrintId, StringComparer.Ordinal)),
            ["depositEvidence"] = JsonSerializer.SerializeToNode(input.DepositEvidence),
            ["notificationPolicy"] = input.NotificationPolicy,
        }.ToJsonString();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
    }

    private static BusinessException RevisionConflict(AiOrderImport import, int expected) =>
        Conflict(
                AiOrderImportErrorCodes.ReviewRevisionConflict,
                "The expected revision is stale.")
            .WithData("ExpectedRevision", expected)
            .WithData("CurrentRevision", import.CurrentRevision);

    private static bool IsConfirmationRace(DbUpdateException exception)
    {
        var message = exception.InnerException?.Message ?? exception.Message;
        return message.Contains("ConfirmationOperationKey", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("UX_AiOrderImports_ConfirmationOperationKey", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("AiOrderImports", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsMaterializationRace(DbUpdateException exception)
    {
        var message = exception.InnerException?.Message ?? exception.Message;
        return message.Contains("MaterializationOperationKey", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("SourceAiOrderImportId", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("FormalOrderId", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("UX_Orders_AiMaterializationOperationKey", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("UX_PaymentTransactions_SourceAiOrderImportId", StringComparison.OrdinalIgnoreCase);
    }

    private static BusinessException Invalid(string message) =>
        new(AiOrderImportErrorCodes.InvalidRequest, message);

    private static BusinessException Conflict(string code, string message) =>
        new(code, message);

    private static BusinessException Blocked(
        string code,
        string message,
        IReadOnlyCollection<AiOrderMaterializationBlockerDto> blockers) =>
        new BusinessException(code, message, BlockerDetails(blockers))
            .WithData("Blockers", blockers.ToArray());

    // Exception data is not guaranteed to reach the client, so the same blockers
    // are also rendered into the transmitted details text, one per line.
    private static string BlockerDetails(
        IReadOnlyCollection<AiOrderMaterializationBlockerDto> blockers) =>
        string.Join(
            "\n",
            blockers.Select(x => string.IsNullOrWhiteSpace(x.Path)
                ? $"{x.Code}: {x.Message}"
                : $"{x.Code}: {x.Message} ({x.Path})"));

    private static void Add(
        ICollection<AiOrderMaterializationBlockerDto>? blockers,
        string code,
        string message,
        string? path = null)
    {
        if (blockers is null ||
            blockers.Any(x => x.Code == code && x.Path == path && x.Message == message))
            return;
        blockers.Add(new AiOrderMaterializationBlockerDto
        {
            Code = code,
            Message = message,
            Path = path,
        });
    }

    private sealed record ReviewRow(
        string GroupId,
        string RowId,
        string Colour,
        string Size,
        int Quantity,
        Guid? VariantId,
        bool AdHocFallback);

    private sealed record ReviewPrint(
        string PrintId,
        string? Position,
        string? PrintSize,
        string? Notes,
        string? DesignNote);

    private sealed record ReviewAdHoc(
        string DisplayName,
        string? Brand,
        string? SupplierName,
        string? SupplierCode,
        string? SupplySource);

    private sealed record ReviewGroup(
        string GroupId,
        string Mode,
        string WrittenName,
        string Name,
        Guid? ProductId,
        string? ProductKind,
        string? PricingModel,
        ReviewAdHoc? AdHoc,
        IReadOnlyList<ReviewRow> Rows,
        IReadOnlyList<ReviewPrint> Printing,
        string? ProductionNotes);
}
