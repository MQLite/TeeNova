using System;
using System.Collections.Generic;

namespace TeeNova.Catalog.Dtos;

public class ProductDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }

    /// <summary>Display/template label only (Jira 9502). Behavior is driven by <see cref="Kind"/> / <see cref="PricingModel"/>.</summary>
    public string ProductType { get; set; } = default!;

    /// <summary>Business category (Jira 9503). Drives UI/admin/snapshot dispatch.</summary>
    public ProductKind Kind { get; set; }

    /// <summary>Pricing behavior (Jira 9503). Drives the pricing strategy dispatch.</summary>
    public PricingModel PricingModel { get; set; }

    /// <summary>Minimum sellable quantity (Jira 9503), enforced server-side. Always ≥ 1.</summary>
    public int MinimumQuantity { get; set; }

    /// <summary>When true, an order item for this product must carry a design asset (Jira 9503).</summary>
    public bool DesignUploadRequired { get; set; }

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

    /// <summary>
    /// Badge quantity-tier unit prices (Jira 9503). Empty for non-Badge products. Active rows only on
    /// the public GET; written via the dedicated quantity-price-tiers endpoint.
    /// </summary>
    public List<ProductQuantityPriceTierDto> QuantityPriceTiers { get; set; } = new();

    /// <summary>
    /// Banner fixed-size price options (Jira 9516). Empty for non-Banner / non-FixedSize products.
    /// Active rows only on the public GET (customer-selectable standard sizes); written via the
    /// dedicated fixed-size-price-options endpoint. Each option prices its line as unit × quantity.
    /// </summary>
    public List<ProductFixedSizePriceOptionDto> FixedSizePriceOptions { get; set; } = new();
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
