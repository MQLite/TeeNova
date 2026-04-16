using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Orders;

/// <summary>
/// Immutable audit trail entry for an order. Created whenever a significant
/// state change or admin action occurs; never updated or deleted.
/// </summary>
public class OrderTimelineEntry : CreationAuditedEntity<Guid>
{
    public Guid OrderId { get; private set; }
    public OrderEventType EventType { get; private set; }

    /// <summary>The order status at the time of this entry (null for non-status events).</summary>
    public OrderStatus? Status { get; private set; }

    /// <summary>Human-readable description stored at write time.</summary>
    public string Description { get; private set; } = default!;

    protected OrderTimelineEntry() { }

    public OrderTimelineEntry(Guid id, Guid orderId, OrderEventType eventType, string description, OrderStatus? status = null)
        : base(id)
    {
        OrderId = orderId;
        EventType = eventType;
        Description = description;
        Status = status;
    }
}
