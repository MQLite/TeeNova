using System;
using System.Collections.Generic;

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

    /// <summary>
    /// Storefront hero "from/reference" pricing (Jira 9303) so cards mirror the product-detail hero
    /// card. Null when the product has no printable group-default tier. The chosen print size is the
    /// first the product can print by PrintSize.SortOrder.
    /// </summary>
    public ProductHeroPriceDto? Hero { get; set; }
}

/// <summary>Display-only hero pricing for a product card (mirror of the product-detail hero card).</summary>
public class ProductHeroPriceDto
{
    /// <summary>Garment "from" price + the chosen print size's price resolved at the reference quantity.</summary>
    public decimal Price { get; set; }

    /// <summary>Name of the chosen print size (first printable by sort order), e.g. "A3".</summary>
    public string PrintSizeName { get; set; } = default!;

    /// <summary>Quantity the price is referenced at (the reference quantity, or the tier break when higher).</summary>
    public int Quantity { get; set; }

    /// <summary>The resolved tier's actual MinQuantity — lets the UI decide whether a hard "minimum" claim is truthful.</summary>
    public int TierMinQuantity { get; set; }

    /// <summary>Fixed garment "from" price (BasePrice + cheapest variant adjustment).</summary>
    public decimal GarmentFromPrice { get; set; }

    /// <summary>Per-size garment price adjustments to surface as a compact secondary line.</summary>
    public List<HeroSizeAdjustmentDto> SizeAdjustments { get; set; } = new();
}

/// <summary>A single garment-size price adjustment shown on the hero card.</summary>
public class HeroSizeAdjustmentDto
{
    public string Size { get; set; } = default!;
    public decimal Adjustment { get; set; }
}
