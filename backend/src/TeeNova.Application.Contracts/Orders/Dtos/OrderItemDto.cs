using System;
using System.Collections.Generic;

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
    public List<OrderItemPrintDto> Prints { get; set; } = new();
}
