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

    [Required]
    public Guid ProductVariantId { get; set; }

    [Range(1, 100)]
    public int Quantity { get; set; } = 1;

    public List<CreateOrderItemPrintDto> Prints { get; set; } = new();
}
