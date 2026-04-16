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
}
