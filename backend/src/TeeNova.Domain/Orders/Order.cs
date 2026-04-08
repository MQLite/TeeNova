using System;
using System.Collections.Generic;
using System.Linq;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Orders;

/// <summary>
/// Aggregate root for an order. Manages the lifecycle from pending to delivered.
/// OrderItems are owned — changes must go through the Order aggregate.
/// </summary>
public class Order : FullAuditedAggregateRoot<Guid>
{
    public string OrderNumber { get; private set; } = default!;
    public OrderStatus Status { get; private set; } = OrderStatus.Pending;
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = default!;
    public string CustomerEmail { get; set; } = default!;
    public ShippingAddress ShippingAddress { get; set; } = default!;
    public decimal TotalAmount { get; private set; }
    public string? Notes { get; set; }

    private readonly List<OrderItem> _items = new();
    public IReadOnlyList<OrderItem> Items => _items.AsReadOnly();

    protected Order() { }

    public Order(Guid id, string customerName, string customerEmail, ShippingAddress shippingAddress)
        : base(id)
    {
        CustomerName = customerName;
        CustomerEmail = customerEmail;
        ShippingAddress = shippingAddress;
        OrderNumber = GenerateOrderNumber(id);
    }

    public void AddItem(OrderItem item)
    {
        _items.Add(item);
        RecalculateTotal();
    }

    public void UpdateStatus(OrderStatus newStatus)
    {
        // Basic guard — extend with a proper state machine as business rules grow
        if (Status == OrderStatus.Delivered || Status == OrderStatus.Cancelled)
        {
            throw new BusinessException("TeeNova:Order:CannotChangeStatus")
                .WithData("CurrentStatus", Status)
                .WithData("RequestedStatus", newStatus);
        }

        Status = newStatus;
    }

    private void RecalculateTotal()
    {
        TotalAmount = _items.Sum(i => i.UnitPrice * i.Quantity);
    }

    private static string GenerateOrderNumber(Guid id) =>
        $"TN-{id.ToString("N")[..8].ToUpper()}";
}
