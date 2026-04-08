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
    /// </summary>
    public string ProductType { get; set; } = "tshirt";

    public ICollection<ProductVariant> Variants { get; set; } = new List<ProductVariant>();
    public ICollection<ProductImage> Images { get; set; } = new List<ProductImage>();

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
