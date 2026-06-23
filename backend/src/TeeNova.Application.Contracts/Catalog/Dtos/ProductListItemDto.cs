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

    /// <summary>
    /// Cheapest product-level tier unit price (the standard printed "from" price), or null when
    /// the product has no product-level tiers. Backend support for the 9104 "from $X ea" card.
    /// </summary>
    public decimal? FromPrice { get; set; }

    /// <summary>True when the product has any quantity-break tiers configured.</summary>
    public bool HasPriceTiers { get; set; }
}
