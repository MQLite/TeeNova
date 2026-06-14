using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// Represents a specific size/color combination of a product.
/// Each variant has its own SKU and can carry a price adjustment.
/// </summary>
public class ProductVariant : Entity<Guid>
{
    public Guid ProductId { get; set; }
    public string Sku { get; set; } = default!;
    public string Color { get; set; } = default!;
    public string Size { get; set; } = default!;
    public decimal PriceAdjustment { get; set; } = 0m;
    public int StockQuantity { get; set; } = 0;
    public bool IsAvailable { get; set; } = true;

    /// <summary>Position within the product's variant matrix (0-based). Preserved from the admin's generated order.</summary>
    public int SortOrder { get; set; } = 0;

    protected ProductVariant() { }

    public ProductVariant(Guid id, Guid productId, string sku, string color, string size)
        : base(id)
    {
        ProductId = productId;
        Sku = sku;
        Color = color;
        Size = size;
    }
}
