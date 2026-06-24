using System;
using System.Collections.Generic;

namespace TeeNova.Catalog.Dtos;

public class ProductDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public string ProductType { get; set; } = default!;
    public bool IsActive { get; set; }
    public DateTime CreationTime { get; set; }

    /// <summary>
    /// Print-pricing aggregation group (Jira 9203). Null = ungrouped (isolated for print tiers).
    /// Products sharing a group combine quantities when resolving print tiers.
    /// </summary>
    public Guid? PrintPricingGroupId { get; set; }

    public List<ProductVariantDto> Variants { get; set; } = new();
    public List<ProductImageDto> Images { get; set; } = new();

    /// <summary>
    /// DEPRECATED (Jira 9203): legacy all-in quantity-break tiers (Jira 9102). No longer used by
    /// pricing — retained only for backward compatibility until the old admin UI is removed.
    /// </summary>
    public List<ProductPriceTierDto> PriceTiers { get; set; } = new();

    /// <summary>
    /// Print-only quantity-break tiers resolved for this product's group (Jira 9203). Empty when the
    /// product is ungrouped or its group has no tiers (printing falls back to PrintSize.BasePrice).
    /// Written only via the group-scoped print-price-tiers endpoint.
    /// </summary>
    public List<ProductPrintPriceTierDto> PrintPriceTiers { get; set; } = new();

    /// <summary>
    /// Product/size scoped allowed print options (Jira 9204). Empty = no scoped options; the product
    /// uses the global PrintAreaSizeOption matrix. Written only via the print-config-options endpoint.
    /// Governs selectability only — unrelated to print price.
    /// </summary>
    public List<ProductPrintConfigOptionDto> PrintConfigOptions { get; set; } = new();
}

public class ProductVariantDto
{
    public Guid Id { get; set; }
    public string Sku { get; set; } = default!;
    public string Color { get; set; } = default!;
    public string Size { get; set; } = default!;
    public decimal PriceAdjustment { get; set; }
    public bool IsAvailable { get; set; }

    // ── Inventory (Jira 9002) — informational only ──────────────────────────────
    public VariantInventoryStatus InventoryStatus { get; set; }
    public int? StockQuantity { get; set; }
    public int? LowStockThreshold { get; set; }
    public string? InventoryNote { get; set; }
    public DateTime? InventoryUpdatedAt { get; set; }
    public string? InventoryUpdatedBy { get; set; }
}

public class ProductImageDto
{
    public Guid Id { get; set; }
    public string Url { get; set; } = default!;
    public bool IsPrimary { get; set; }
    public int SortOrder { get; set; }
    public string? Color { get; set; }
}
