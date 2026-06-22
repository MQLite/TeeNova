using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// Represents a specific size/color combination of a product.
/// Each variant has its own SKU and can carry a price adjustment.
/// </summary>
public class ProductVariant : Entity<Guid>
{
    public Guid ProductId { get; set; }
    public string Sku { get; set; } = default!;
    public string Color { get; set; } = default!;
    public string Size { get; set; } = default!;
    public decimal PriceAdjustment { get; set; } = 0m;
    public bool IsAvailable { get; set; } = true;

    /// <summary>Position within the product's variant matrix (0-based). Preserved from the admin's generated order.</summary>
    public int SortOrder { get; set; } = 0;

    // ── Inventory (Jira 9002) ───────────────────────────────────────────────────
    // Informational only: never blocks checkout, hides variants, or deducts stock.
    // Sellability stays governed by IsAvailable. Inventory is mutated exclusively
    // through CatalogAppService.UpdateVariantInventoryAsync — the variant
    // create/update/bulk flows deliberately leave these fields untouched.

    /// <summary>Informational inventory state. Defaults to <see cref="VariantInventoryStatus.NotRecorded"/>.</summary>
    public VariantInventoryStatus InventoryStatus { get; set; } = VariantInventoryStatus.NotRecorded;

    /// <summary>Recorded on-hand quantity. Null when not tracked (e.g. NotRecorded). Never negative.</summary>
    public int? StockQuantity { get; set; }

    /// <summary>Optional manual low-stock threshold. Null when unset. Never negative.</summary>
    public int? LowStockThreshold { get; set; }

    /// <summary>Optional free-text inventory note (e.g. shelf location).</summary>
    public string? InventoryNote { get; set; }

    /// <summary>Server-stamped time the inventory was last updated. Null until first recorded.</summary>
    public DateTime? InventoryUpdatedAt { get; set; }

    /// <summary>User name of the admin who last updated inventory. Null until first recorded.</summary>
    public string? InventoryUpdatedBy { get; set; }

    protected ProductVariant() { }

    public ProductVariant(Guid id, Guid productId, string sku, string color, string size)
        : base(id)
    {
        ProductId = productId;
        Sku = sku;
        Color = color;
        Size = size;
    }
}
