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
    public Guid? ProductId { get; private set; }
    public OrderItemProductSource ProductSource { get; private set; } =
        OrderItemProductSource.Catalogue;
    public Guid? OrderAdHocProductSnapshotId { get; private set; }

    /// <summary>Garment variant. Null for non-garment products (Badge has no color/size variant).</summary>
    public Guid? ProductVariantId { get; set; }
    public string ProductName { get; set; } = default!;

    /// <summary>"Color / Size" snapshot for garments; null for non-garment products (Jira 9503).</summary>
    public string? VariantLabel { get; set; }   // e.g., "Red / XL"
    public string? ColourSnapshot { get; private set; }
    public string? SizeSnapshot { get; private set; }
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

    /// <summary>
    /// Legacy reserved field for non-garment configuration snapshots. Superseded for Banner by the
    /// structured one-to-one <see cref="BannerDetail"/> (Jira 9511); left in place for backward
    /// compatibility but not used by Banner MVP. Null for Garment/Badge.
    /// </summary>
    public string? ConfigurationJson { get; set; }

    /// <summary>
    /// Banner configuration snapshot (Jira 9511). Present only for <see cref="Catalog.ProductKind.Banner"/>
    /// items; null for Garment and Badge. One-to-one, cascade-deleted with this item.
    /// </summary>
    public OrderItemBannerDetail? BannerDetail { get; set; }

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
        ProductSource = OrderItemProductSource.Catalogue;
        OrderAdHocProductSnapshotId = null;
        ProductVariantId = productVariantId;
        ProductName = productName;
        VariantLabel = variantLabel;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }

    public static OrderItem CreateAdHoc(
        Guid id,
        Guid orderId,
        Guid adHocSnapshotId,
        string productName,
        string colour,
        string size,
        int quantity,
        decimal unitPrice)
    {
        if (adHocSnapshotId == Guid.Empty)
            throw new ArgumentException("An ad-hoc snapshot identifier is required.", nameof(adHocSnapshotId));
        if (quantity <= 0)
            throw new ArgumentOutOfRangeException(nameof(quantity));
        if (unitPrice < 0)
            throw new ArgumentOutOfRangeException(nameof(unitPrice));

        var item = new OrderItem
        {
            Id = id,
            OrderId = orderId,
            ProductId = null,
            ProductSource = OrderItemProductSource.AdHoc,
            OrderAdHocProductSnapshotId = adHocSnapshotId,
            ProductVariantId = null,
            ProductName = productName,
            VariantLabel = $"{colour} / {size}",
            ColourSnapshot = colour,
            SizeSnapshot = size,
            Quantity = quantity,
            UnitPrice = unitPrice,
            PricingModel = PricingModel.GarmentPrint,
            ProductKind = ProductKind.Garment,
            InventoryDeductionEligible = false,
        };
        return item;
    }

    public void SetCatalogueVariantSnapshots(string colour, string size)
    {
        if (ProductSource != OrderItemProductSource.Catalogue)
            throw new InvalidOperationException("Only catalogue items use catalogue variant snapshots.");
        ColourSnapshot = colour?.Trim();
        SizeSnapshot = size?.Trim();
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
