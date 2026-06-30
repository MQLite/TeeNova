using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

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
    public DeliveryMethod? DeliveryMethod { get; set; }
}

public class CreateOrderItemDto
{
    [Required]
    public Guid ProductId { get; set; }

    /// <summary>
    /// Garment variant. Optional (Jira 9503): required for garment products (enforced server-side by the
    /// pricing strategy), omitted for non-garment products such as Badge.
    /// </summary>
    public Guid? ProductVariantId { get; set; }

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    // ── Item-level design (Jira 9503) — used by non-garment items (Badge). Garment design lives in Prints.
    public Guid?   UploadedAssetId  { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote       { get; set; }

    /// <summary>Reserved non-garment configuration (Banner). Ignored for Garment/Badge MVP.</summary>
    public string? ConfigurationJson { get; set; }

    public List<CreateOrderItemPrintDto> Prints { get; set; } = new();
}
