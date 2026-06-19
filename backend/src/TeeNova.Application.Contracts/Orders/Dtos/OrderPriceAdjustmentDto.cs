using System;

namespace TeeNova.Orders.Dtos;

public class OrderPriceAdjustmentDto
{
    public Guid     Id               { get; set; }
    public Guid     OrderId          { get; set; }
    public decimal  OldTotalAmount   { get; set; }
    public decimal  NewTotalAmount   { get; set; }
    public decimal  AdjustmentAmount { get; set; }
    public string   Reason           { get; set; } = default!;
    public string?  AdjustedByUser   { get; set; }
    public DateTime CreationTime     { get; set; }
    public Guid?    CreatorId        { get; set; }
}
