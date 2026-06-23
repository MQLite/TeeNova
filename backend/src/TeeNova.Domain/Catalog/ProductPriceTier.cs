using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// A quantity-break price rule for a product (Jira 9102). The <see cref="UnitPrice"/> is the
/// final unit price for the <b>standard printed product</b> — garment + one standard one-side
/// print — at or above <see cref="MinQuantity"/>. Extra/different print add-ons beyond the
/// included standard print remain additive through the existing print-add-on pricing.
///
/// Scope (Option C from the 9101 audit):
///   • <see cref="ProductVariantId"/> == null → product-level default tier.
///   • <see cref="ProductVariantId"/> != null → optional variant-level override tier.
/// Resolution prefers variant-level tiers when any exist for that variant, otherwise falls back
/// to the product-level set; within the chosen set the highest MinQuantity ≤ quantity wins.
/// </summary>
public class ProductPriceTier : Entity<Guid>
{
    public Guid ProductId { get; set; }

    /// <summary>Null = product-level default tier. Non-null = override for a specific variant.</summary>
    public Guid? ProductVariantId { get; set; }

    /// <summary>Inclusive lower bound for this tier. Always ≥ 1. The highest tier is open-ended.</summary>
    public int MinQuantity { get; set; }

    /// <summary>Final standard printed unit price (NZD) at this break. Always &gt; 0, max 2 decimals.</summary>
    public decimal UnitPrice { get; set; }

    protected ProductPriceTier() { }

    public ProductPriceTier(Guid id, Guid productId, Guid? productVariantId, int minQuantity, decimal unitPrice)
        : base(id)
    {
        ProductId        = productId;
        ProductVariantId = productVariantId;
        MinQuantity      = minQuantity;
        UnitPrice        = unitPrice;
    }
}
