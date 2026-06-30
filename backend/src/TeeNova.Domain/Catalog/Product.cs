using System;
using System.Collections.Generic;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Catalog;

/// <summary>
/// Core catalog entity. A Product represents a printable item type (e.g., Unisex T-Shirt).
/// Variants hold the specific size/color/price combinations.
/// </summary>
public class Product : FullAuditedAggregateRoot<Guid>
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Base price before variant-level adjustments.
    /// </summary>
    public decimal BasePrice { get; set; }

    /// <summary>
    /// Product type tag — used for routing to correct print template logic.
    /// e.g., "tshirt", "hoodie", "banner", "badge"
    /// Display/template label only (Jira 9502): it carries NO behavioral contract. Behavior is driven
    /// by <see cref="Kind"/> (category) and <see cref="PricingModel"/> (pricing).
    /// </summary>
    public string ProductType { get; set; } = "tshirt";

    /// <summary>
    /// Business category (Jira 9503). Drives UI / admin / order-snapshot dispatch. Existing products
    /// default to <see cref="ProductKind.Garment"/>.
    /// </summary>
    public ProductKind Kind { get; set; } = ProductKind.Garment;

    /// <summary>
    /// Pricing behavior (Jira 9503). The single discriminator the pricing strategy seam dispatches on.
    /// Existing products default to <see cref="PricingModel.GarmentPrint"/> (unchanged behavior).
    /// </summary>
    public PricingModel PricingModel { get; set; } = PricingModel.GarmentPrint;

    /// <summary>
    /// Minimum sellable quantity (Jira 9503). Enforced authoritatively at order time. Always ≥ 1.
    /// Relevant primarily to Badge (<see cref="PricingModel.QuantityTierUnit"/>); garments keep 1.
    /// </summary>
    public int MinimumQuantity { get; set; } = 1;

    /// <summary>
    /// When true, an order item for this product must carry a design asset (Jira 9503). Used by Badge.
    /// </summary>
    public bool DesignUploadRequired { get; set; }

    /// <summary>
    /// Optional print-pricing aggregation scope (Jira 9203). Products sharing a
    /// <see cref="PrintPricingGroup"/> combine their quantities when resolving print tiers.
    /// Null = ungrouped: this product is isolated and never aggregates with others.
    /// Plain nullable column (no FK navigation) — resolution checks the group at runtime, and this
    /// keeps product/group deletion free of cascade-path concerns (mirrors ProductPriceTier scope).
    /// </summary>
    public Guid? PrintPricingGroupId { get; set; }

    public ICollection<ProductVariant> Variants { get; set; } = new List<ProductVariant>();
    public ICollection<ProductImage> Images { get; set; } = new List<ProductImage>();

    /// <summary>
    /// Quantity-break pricing rules (Jira 9102). Empty means this product uses the legacy
    /// additive formula unchanged. Written exclusively through the dedicated price-tiers
    /// endpoint so normal product/variant edits never clobber them.
    /// </summary>
    public ICollection<ProductPriceTier> PriceTiers { get; set; } = new List<ProductPriceTier>();

    /// <summary>
    /// Badge quantity-tier unit prices (Jira 9503). Empty for non-Badge products. Written exclusively
    /// through the dedicated quantity-price-tiers endpoint so normal product/variant edits never
    /// clobber them (mirrors <see cref="PriceTiers"/> / print tiers single-writer discipline).
    /// </summary>
    public ICollection<ProductQuantityPriceTier> QuantityPriceTiers { get; set; } = new List<ProductQuantityPriceTier>();

    // Future: public ICollection<TemplateLayout> SupportedLayouts { get; set; }

    protected Product() { }

    public Product(Guid id, string name, decimal basePrice, string productType = "tshirt")
        : base(id)
    {
        Name = name;
        BasePrice = basePrice;
        ProductType = productType;
    }
}
