using System;

namespace TeeNova.Catalog.Dtos;

/// <summary>Lightweight DTO for product list/grid views — omits full variants.</summary>
public class ProductListItemDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public decimal BasePrice { get; set; }
    public string ProductType { get; set; } = default!;
    public bool IsActive { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? PrimaryImageUrl { get; set; }
    public int VariantCount { get; set; }

    /// <summary>Print-pricing group (Jira 9203). Null = ungrouped.</summary>
    public Guid? PrintPricingGroupId { get; set; }

    /// <summary>
    /// Cheapest achievable printed "from" price (Jira 9203): fixed garment BasePrice plus the
    /// cheapest active print-tier price across the product's group (falling back to PrintSize.BasePrice
    /// when a print size has no tiers). Null when no printable price can be derived.
    /// </summary>
    public decimal? FromPrice { get; set; }

    /// <summary>True when the product's group has any active print price tiers (Jira 9203).</summary>
    public bool HasPriceTiers { get; set; }
}
