using System;
using System.Collections.Generic;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;

namespace TeeNova.AiOrderImports.Dtos;

public sealed class ConfirmAiOrderImportInput
{
    public int ExpectedRevision { get; set; }
    public string ConfirmationOperationKey { get; set; } = string.Empty;
}

public sealed class AiOrderImportConfirmationDto
{
    public Guid ImportId { get; set; }
    public AiOrderImportStatus Status { get; set; }
    public int ConfirmedRevision { get; set; }
    public string ConfirmedCanonicalSha256 { get; set; } = string.Empty;
    public string ReviewVersion { get; set; } = string.Empty;
    public Guid ConfirmedByAdminId { get; set; }
    public DateTime ConfirmedAt { get; set; }
    public int BlockingIssueCount { get; set; }
    public bool FormalOrderCreated { get; set; }
    public Guid? FormalOrderId { get; set; }
}

public sealed class AiOrderMaterializationBlockerDto
{
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Path { get; set; }
}

public sealed class AiOrderMaterializationGroupDto
{
    public string GroupId { get; set; } = string.Empty;
    public string ProductSource { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public Guid? CatalogueProductId { get; set; }
    public IReadOnlyList<AiOrderMaterializationRowDto> Rows { get; set; } = [];
}

public sealed class AiOrderMaterializationRowDto
{
    public string RowId { get; set; } = string.Empty;
    public string Colour { get; set; } = string.Empty;
    public string Size { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public Guid? CatalogueVariantId { get; set; }
    public string? AdHocUnitPrice { get; set; }

    /// <summary>
    /// True when the group is catalogue-backed but this size has no live variant, so the
    /// row is created as an ad-hoc line instead of blocking the group.
    /// </summary>
    public bool AdHocFallback { get; set; }
}

public sealed class AiOrderMaterializationPreflightDto
{
    public Guid ImportId { get; set; }
    public int ConfirmedRevision { get; set; }
    public string ConfirmedCanonicalSha256 { get; set; } = string.Empty;
    public IReadOnlyList<AiOrderMaterializationGroupDto> ProductGroups { get; set; } = [];
    public string CatalogueStatus { get; set; } = string.Empty;
    public string WrittenOrderTotal { get; set; } = string.Empty;
    public string DepositPaid { get; set; } = string.Empty;
    public string? CalculatedCatalogueTotal { get; set; }
    public string PricingStatus { get; set; } = string.Empty;
    public bool PaymentEvidenceRequired { get; set; }
    public string ProposedInitialOrderStatus { get; set; } = OrderStatus.Pending.ToString();
    public IReadOnlyList<AiOrderMaterializationBlockerDto> Blockers { get; set; } = [];
    public bool CanMaterialize { get; set; }
    public bool AlreadyMaterialized { get; set; }
    public Guid? FormalOrderId { get; set; }
}

public sealed class MaterializeAiOrderImportInput
{
    public string MaterializationOperationKey { get; set; } = string.Empty;
    public int ConfirmedRevision { get; set; }
    public AiOrderMaterializationCustomerInput Customer { get; set; } = new();
    public AiOrderMaterializationFulfilmentInput Fulfilment { get; set; } = new();
    public AiOrderPricingDecisionInput PricingDecision { get; set; } = new();
    public IReadOnlyList<AiOrderAdHocPriceInput> AdHocPricing { get; set; } = [];
    public IReadOnlyList<AiOrderCataloguePrintSelectionInput> CataloguePrinting { get; set; } = [];
    public AiOrderDepositEvidenceInput? DepositEvidence { get; set; }
    public string NotificationPolicy { get; set; } = "DoNotSend";
}

public sealed class AiOrderMaterializationCustomerInput
{
    public string? Name { get; set; }
    public string Email { get; set; } = string.Empty;
}

public sealed class AiOrderMaterializationFulfilmentInput
{
    public DeliveryMethod? DeliveryMethod { get; set; }
    public ShippingAddressDto? ShippingAddress { get; set; }
}

public sealed class AiOrderPricingDecisionInput
{
    public string Mode { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public sealed class AiOrderAdHocPriceInput
{
    public string GroupId { get; set; } = string.Empty;
    public string RowId { get; set; } = string.Empty;
    public string UnitPrice { get; set; } = string.Empty;
}

public sealed class AiOrderCataloguePrintSelectionInput
{
    public string GroupId { get; set; } = string.Empty;
    public string PrintId { get; set; } = string.Empty;
    public Guid PrintAreaId { get; set; }
    public Guid PrintSizeId { get; set; }
}

public sealed class AiOrderDepositEvidenceInput
{
    public ManualPaymentMethod? PaymentMethod { get; set; }
    public string? Reference { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public bool AcknowledgedByAdmin { get; set; }
}

public sealed class AiOrderMaterializationResultDto
{
    public Guid ImportId { get; set; }
    public bool Created { get; set; }
    public bool WasIdempotentReplay { get; set; }
    public string Outcome { get; set; } = string.Empty;
    public Guid? OrderId { get; set; }
    public string? OrderNumber { get; set; }
    public OrderStatus? OrderStatus { get; set; }
    public PaymentStatus? PaymentStatus { get; set; }
    public string PricingMode { get; set; } = string.Empty;
    public string WrittenOrderTotal { get; set; } = string.Empty;
    public string CalculatedMaterializationTotal { get; set; } = string.Empty;
    public string FinalOrderTotal { get; set; } = string.Empty;
    public string DepositPaid { get; set; } = string.Empty;
    public bool PaymentTransactionCreated { get; set; }
    public bool EmailSent { get; set; }
    public bool InventoryChanged { get; set; }
    public bool ProductionWorkCreated { get; set; }
    public bool ProductionPdfGenerated { get; set; }
}
