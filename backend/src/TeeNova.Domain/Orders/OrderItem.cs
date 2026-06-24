using System;
using Volo.Abp.Domain.Entities;
using System.Collections.Generic;
using System.Linq;

namespace TeeNova.Orders;

/// <summary>
/// Line item within an Order. Captures the product, variant, quantity,
/// and customization details (which design, where it prints).
/// </summary>
public class OrderItem : Entity<Guid>
{
    public Guid OrderId { get; set; }
    public Guid ProductId { get; set; }
    public Guid ProductVariantId { get; set; }
    public string ProductName { get; set; } = default!;
    public string VariantLabel { get; set; } = default!;   // e.g., "Red / XL"
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }

    /// <summary>
    /// Idempotency marker for the optional post-production stock deduction (Jira 9005).
    /// Stamped once when the item is processed at the production-complete transition so
    /// repeated transitions cannot double-deduct. Null = not yet processed.
    /// </summary>
    public DateTime? InventoryDeductedAt { get; set; }

    /// <summary>
    /// Captures, at order-creation time, whether auto-deduction was enabled. Only items created
    /// while the setting was ON are ever eligible for deduction (Jira 9005), so enabling the
    /// setting later never retroactively deducts old orders. Defaults to false.
    /// </summary>
    public bool InventoryDeductionEligible { get; set; }

    public List<OrderItemPrint> Prints { get; private set; } = [];

    // Future: DesignProjectId, TemplateId, CropFrameData (JSON)

    protected OrderItem() { }

    public OrderItem(
        Guid id, Guid orderId,
        Guid productId, Guid productVariantId,
        string productName, string variantLabel,
        int quantity, decimal unitPrice)
        : base(id)
    {
        OrderId = orderId;
        ProductId = productId;
        ProductVariantId = productVariantId;
        ProductName = productName;
        VariantLabel = variantLabel;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }

    public void AddPrint(
        Guid id,
        Guid printAreaId,
        string printAreaName,
        string printAreaCode,
        decimal printAreaPrice,
        Guid printSizeId,
        string printSizeName,
        string printSizeCode,
        decimal printSizePrice,
        decimal resolvedUnitPrintPrice = 0m,
        int? appliedPrintTierMinQuantity = null,
        int sortOrder = 0,
        string? notes = null,
        Guid? uploadedAssetId = null,
        string? uploadedAssetUrl = null,
        string? designNote = null)
    {
        Prints.Add(new OrderItemPrint(
            id, Id,
            printAreaId, printAreaName, printAreaCode, printAreaPrice,
            printSizeId, printSizeName, printSizeCode, printSizePrice,
            resolvedUnitPrintPrice, appliedPrintTierMinQuantity,
            sortOrder, notes, uploadedAssetId, uploadedAssetUrl, designNote));
    }

    public OrderItemPrint UpdatePrintDesign(
        Guid printId,
        Guid? uploadedAssetId,
        string? uploadedAssetUrl,
        string? designNote)
    {
        var print = Prints.FirstOrDefault(p => p.Id == printId)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(OrderItemPrint), printId);

        print.UpdateDesign(uploadedAssetId, uploadedAssetUrl, designNote);
        return print;
    }
}
