using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Orders;

/// <summary>
/// Append-only audit record of a single admin-initiated price adjustment on an order.
/// Never updated or deleted after creation.
/// </summary>
public class OrderPriceAdjustment : CreationAuditedEntity<Guid>
{
    public Guid    OrderId          { get; private set; }
    public decimal OldTotalAmount   { get; private set; }
    public decimal NewTotalAmount   { get; private set; }
    public decimal AdjustmentAmount { get; private set; }  // NewTotalAmount - OldTotalAmount
    public string  Reason           { get; private set; } = default!;
    public string? AdjustedByUser   { get; private set; }

    protected OrderPriceAdjustment() { }

    public OrderPriceAdjustment(
        Guid    id,
        Guid    orderId,
        decimal oldTotalAmount,
        decimal newTotalAmount,
        string  reason,
        string? adjustedByUser)
        : base(id)
    {
        if (orderId == Guid.Empty)
            throw new ArgumentException("OrderId cannot be empty.", nameof(orderId));

        if (oldTotalAmount < 0)
            throw new ArgumentException("OldTotalAmount must be >= 0.", nameof(oldTotalAmount));

        if (newTotalAmount <= 0)
            throw new ArgumentException("NewTotalAmount must be > 0.", nameof(newTotalAmount));

        Check.NotNullOrWhiteSpace(reason, nameof(reason), maxLength: 1000);

        OrderId          = orderId;
        OldTotalAmount   = oldTotalAmount;
        NewTotalAmount   = newTotalAmount;
        AdjustmentAmount = newTotalAmount - oldTotalAmount;
        Reason           = reason.Trim();
        AdjustedByUser   = string.IsNullOrWhiteSpace(adjustedByUser) ? null : adjustedByUser.Trim();
    }
}
