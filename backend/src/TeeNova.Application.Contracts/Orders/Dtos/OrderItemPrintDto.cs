using System;

namespace TeeNova.Orders.Dtos;

public class OrderItemPrintDto
{
    public Guid Id { get; set; }

    public Guid PrintAreaId { get; set; }
    public string PrintAreaName { get; set; } = default!;
    public string PrintAreaCode { get; set; } = default!;
    public decimal PrintAreaPrice { get; set; }

    public Guid PrintSizeId { get; set; }
    public string PrintSizeName { get; set; } = default!;
    public string PrintSizeCode { get; set; } = default!;
    public decimal PrintSizePrice { get; set; }

    public int SortOrder { get; set; }
    public string? Notes { get; set; }
}
