using System;
using TeeNova.Orders;

namespace TeeNova.Orders.Dtos;

public class OrderTimelineEntryDto
{
    public Guid Id { get; set; }
    public OrderEventType EventType { get; set; }
    public OrderStatus? Status { get; set; }
    public string Description { get; set; } = default!;
    public DateTime CreationTime { get; set; }
}
