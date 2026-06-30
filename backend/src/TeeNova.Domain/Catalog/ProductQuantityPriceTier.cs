using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// A product-scoped quantity-break <b>unit</b> price rule (Jira 9503), used by the Badge
/// <see cref="PricingModel.QuantityTierUnit"/> model. <see cref="UnitPrice"/> is the final per-unit
/// price (NZD) charged for the whole product at or above <see cref="MinQuantity"/>;
/// <c>lineTotal = UnitPrice × quantity</c>.
///
/// Deliberately product-scoped ONLY — it has no <c>ProductVariantId</c>, no <c>PrintSizeId</c> and no
/// <c>PrintPricingGroupId</c>. This is a clean, separate table from the print-only
/// <see cref="ProductPrintPriceTier"/> (which is coupled to PrintSize + PrintPricingGroup) and from the
/// retired all-in <see cref="ProductPriceTier"/> (which carries garment variant scope). Those are not
/// reused for Badge.
///
/// Resolution (active rows only): the highest <see cref="MinQuantity"/> ≤ quantity wins. Badge orders
/// are gated by <c>Product.MinimumQuantity</c>, so a below-lowest-break quantity should not normally
/// reach the resolver; the resolver still falls back defensively to the lowest break.
/// </summary>
public class ProductQuantityPriceTier : Entity<Guid>
{
    public Guid ProductId { get; set; }

    /// <summary>Inclusive lower bound for this tier. Always ≥ 1. The highest tier is open-ended.</summary>
    public int MinQuantity { get; set; }

    /// <summary>Final per-unit price (NZD) at this break. Always &gt; 0, max 2 decimals.</summary>
    public decimal UnitPrice { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected ProductQuantityPriceTier() { }

    public ProductQuantityPriceTier(
        Guid id,
        Guid productId,
        int minQuantity,
        decimal unitPrice,
        bool isActive = true,
        int sortOrder = 0)
        : base(id)
    {
        ProductId   = productId;
        MinQuantity = minQuantity;
        UnitPrice   = unitPrice;
        IsActive    = isActive;
        SortOrder   = sortOrder;
    }
}
