using System;
using System.Collections.Generic;
using TeeNova.Customization;

namespace TeeNova.Orders.Dtos;

public class OrderItemDto
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public Guid ProductVariantId { get; set; }
    public string ProductName { get; set; } = default!;
    public string VariantLabel { get; set; } = default!;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal => UnitPrice * Quantity;
    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public PrintPosition? PrintPosition { get; set; }
    public string? DesignNote { get; set; }
    /// <summary>JSON array of all print positions with their uploads. Null for legacy orders.</summary>
    public string? PrintPositionsJson { get; set; }
    public List<OrderItemPositionAssetDto> PositionAssets { get; set; } = new();
}
