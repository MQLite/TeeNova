namespace TeeNova.Catalog;

/// <summary>
/// Business category of a product (Jira 9502/9503). Drives UI / admin / order-snapshot dispatch
/// (which selectors, panels, and editors to render), distinct from <see cref="PricingModel"/> which
/// drives pricing behavior, and distinct from the free-text display tag <c>Product.ProductType</c>.
///
/// Existing products backfill to <see cref="Garment"/>.
/// </summary>
public enum ProductKind
{
    /// <summary>Printed garment with color/size variants and print placements (the existing model).</summary>
    Garment = 0,

    /// <summary>Badge: quantity-tier unit pricing, item-level design, no variant/print (Jira 9503).</summary>
    Badge = 1,

    /// <summary>Banner: dimensions/material/finishing; pricing model still being designed.</summary>
    Banner = 2,

    /// <summary>Any other custom product category.</summary>
    Other = 3,
}
