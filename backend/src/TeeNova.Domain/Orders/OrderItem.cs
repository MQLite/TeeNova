using System;
using Volo.Abp.Domain.Entities;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;

namespace TeeNova.Orders;

/// <summary>
/// Line item within an Order. Captures the product, quantity, the pricing/category model snapshot, and
/// customization details. For garments this is variant + print placements (<see cref="Prints"/>); for
/// non-garment products (e.g. Badge, Jira 9503) variant/prints are absent and the design lives in the
/// item-level <see cref="UploadedAssetId"/>/<see cref="UploadedAssetUrl"/>/<see cref="DesignNote"/>.
/// </summary>
public class OrderItem : Entity<Guid>
{
    public Guid OrderId { get; set; }
    public Guid ProductId { get; set; }

    /// <summary>Garment variant. Null for non-garment products (Badge has no color/size variant).</summary>
    public Guid? ProductVariantId { get; set; }
    public string ProductName { get; set; } = default!;

    /// <summary>"Color / Size" snapshot for garments; null for non-garment products (Jira 9503).</summary>
    public string? VariantLabel { get; set; }   // e.g., "Red / XL"
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }

    // ── Model snapshot (Jira 9503) ───────────────────────────────────────────────
    // Captured at order time so display/PDF/email/tracking render correctly even if the product later
    // changes. Existing/garment rows default to GarmentPrint / Garment.
    public PricingModel PricingModel { get; set; } = PricingModel.GarmentPrint;
    public ProductKind  ProductKind  { get; set; } = ProductKind.Garment;

    // ── Item-level design (Jira 9503) ────────────────────────────────────────────
    // Used by non-garment products (Badge) that have no OrderItemPrint. Null for garments, whose design
    // lives per-placement on OrderItemPrint.
    public Guid?   UploadedAssetId  { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote       { get; set; }

    /// <summary>Applied Badge quantity-tier MinQuantity snapshot (Jira 9503); null when not applicable.</summary>
    public int? AppliedQuantityTierMinQuantity { get; set; }

    /// <summary>Reserved for non-garment configuration snapshots (e.g. Banner dimensions). Null for now.</summary>
    public string? ConfigurationJson { get; set; }

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
        Guid productId, Guid? productVariantId,
        string productName, string? variantLabel,
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
