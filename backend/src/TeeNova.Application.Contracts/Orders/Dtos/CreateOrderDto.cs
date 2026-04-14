using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using TeeNova.Customization;

namespace TeeNova.Orders.Dtos;

public class CreateOrderDto
{
    [Required, EmailAddress]
    public string CustomerEmail { get; set; } = default!;

    [Required]
    public ShippingAddressDto ShippingAddress { get; set; } = default!;

    [Required, MinLength(1)]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    public string? Notes { get; set; }
}

public class CreateOrderItemDto
{
    [Required]
    public Guid ProductId { get; set; }

    [Required]
    public Guid ProductVariantId { get; set; }

    [Range(1, 100)]
    public int Quantity { get; set; } = 1;

    // Legacy single-position fields (kept for backward compatibility)
    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public PrintPosition? PrintPosition { get; set; }
    public string? DesignNote { get; set; }

    // All selected positions with their individual uploads
    public List<CreateOrderItemPositionDto>? PrintPositions { get; set; }
}

public class CreateOrderItemPositionDto
{
    public string Position { get; set; } = default!;
    public Guid? AssetId { get; set; }
    public string? AssetUrl { get; set; }
    public string? DesignNote { get; set; }
}
