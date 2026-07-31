using System;
using System.Collections.Generic;
using System.Text.Json;

namespace TeeNova.AiOrderImports.Dtos;

public sealed class SaveAiOrderReviewInput
{
    public int ExpectedRevision { get; set; }
    public string ReviewVersion { get; set; } = string.Empty;
    public AiOrderReviewCustomerInput Customer { get; set; } = new();
    public IReadOnlyList<AiOrderReviewProductGroupInput> ProductGroups { get; set; } = [];
    public AiOrderReviewFinancialsInput Financials { get; set; } = new();
    public IReadOnlyList<AiOrderIssueResolutionInput> IssueResolutions { get; set; } = [];
    public IReadOnlyList<AiOrderReviewOperationInput> Operations { get; set; } = [];
}

public sealed class AiOrderReviewCustomerInput
{
    public AiOrderReviewTextInput Name { get; set; } = new();
    public AiOrderReviewTextInput Phone { get; set; } = new();
    public AiOrderReviewTextInput Email { get; set; } = new();
    public AiOrderReviewTextInput Organisation { get; set; } = new();
    public AiOrderReviewTextInput AddressOrFulfilmentNotes { get; set; } = new();
}

public class AiOrderReviewTextInput
{
    public string? StaffValue { get; set; }
    public string Decision { get; set; } = "Unresolved";
    public string? Reason { get; set; }
}

public sealed class AiOrderReviewProductGroupInput
{
    public string GroupId { get; set; } = string.Empty;
    public AiOrderReviewTextInput WrittenProductName { get; set; } = new();
    public AiOrderReviewProductSelectionInput ProductSelection { get; set; } = new();
    public AiOrderReviewControlledValueInput Colour { get; set; } = new();
    public AiOrderReviewTextInput SupplySource { get; set; } = new();
    public AiOrderReviewTextInput ArtworkIdentity { get; set; } = new();
    public AiOrderReviewTextInput ArtworkDescription { get; set; } = new();
    public AiOrderReviewTextInput ProductionNotes { get; set; } = new();
    public IReadOnlyList<AiOrderReviewPrintInput> Printing { get; set; } = [];
    public IReadOnlyList<AiOrderReviewSizeRowInput> SizeQuantityRows { get; set; } = [];
}

public sealed class AiOrderReviewProductSelectionInput
{
    public string Mode { get; set; } = "Unresolved";
    public Guid? CatalogueProductId { get; set; }
    public string? Reason { get; set; }
    public AiOrderReviewAdHocProductInput? AdHocProduct { get; set; }
}

public sealed class AiOrderReviewAdHocProductInput
{
    public string? DisplayName { get; set; }
    public string? Brand { get; set; }
    public string? SupplierName { get; set; }
    public string? SupplierCode { get; set; }
    public string? SupplySource { get; set; }
    public bool Confirmed { get; set; }
    public bool AcknowledgedOrderOnly { get; set; }
    public string? Reason { get; set; }
}

public sealed class AiOrderReviewControlledValueInput
{
    public string? Kind { get; set; }
    public string? Label { get; set; }
    public string Decision { get; set; } = "Unresolved";
    public string? Reason { get; set; }
}

public sealed class AiOrderReviewPrintInput
{
    public string PrintId { get; set; } = string.Empty;
    public AiOrderReviewTextInput Position { get; set; } = new();
    public AiOrderReviewTextInput PrintSize { get; set; } = new();
    public AiOrderReviewTextInput Notes { get; set; } = new();
}

public sealed class AiOrderReviewSizeRowInput
{
    public string RowId { get; set; } = string.Empty;
    public AiOrderReviewControlledValueInput Size { get; set; } = new();
    public int? Quantity { get; set; }
    public string QuantityDecision { get; set; } = "Unresolved";
    public string? QuantityReason { get; set; }
    public Guid? ConfirmedProductVariantId { get; set; }
}

public sealed class AiOrderReviewFinancialsInput
{
    public AiOrderReviewMoneyInput OrderTotal { get; set; } = new();
    public AiOrderReviewMoneyInput DepositPaid { get; set; } = new();
}

public sealed class AiOrderReviewMoneyInput
{
    public string? StaffValue { get; set; }
    public string Decision { get; set; } = "Unresolved";
    public string? Reason { get; set; }
}

public sealed class AiOrderIssueResolutionInput
{
    public string IssueId { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public sealed class AiOrderReviewOperationInput
{
    public string Action { get; set; } = string.Empty;
    public string? Path { get; set; }
    public IReadOnlyList<string> SourceIds { get; set; } = [];
    public IReadOnlyList<string> ResultIds { get; set; } = [];
    public string? Reason { get; set; }
}

public sealed class AiOrderCatalogueSearchResultDto
{
    public IReadOnlyList<AiOrderCatalogueSearchItemDto> Items { get; set; } = [];
}

public sealed class AiOrderCatalogueSearchItemDto
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string ProductKind { get; set; } = string.Empty;
    public string PricingModel { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string MatchKind { get; set; } = string.Empty;
    public IReadOnlyList<AiOrderCatalogueVariantDto> Variants { get; set; } = [];
}

public sealed class AiOrderCatalogueVariantDto
{
    public Guid ProductVariantId { get; set; }
    public string Sku { get; set; } = string.Empty;
    public string Colour { get; set; } = string.Empty;
    public string Size { get; set; } = string.Empty;
    public bool IsAvailable { get; set; }
}

public sealed class AiOrderReviewConflictDto
{
    public int CurrentRevision { get; set; }
    public AiOrderImportStatus Status { get; set; }
    public DateTime? LatestRecordedAt { get; set; }
}
