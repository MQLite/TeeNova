using System;
using System.Collections.Generic;
using System.Linq;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Orders;

/// <summary>
/// Aggregate root for an order. Manages the lifecycle from pending to completed.
/// OrderItems are owned and changes must go through the Order aggregate.
/// </summary>
public class Order : FullAuditedAggregateRoot<Guid>
{
    public static readonly TimeSpan ReopenWindow = TimeSpan.FromHours(24);

    private static readonly Dictionary<OrderStatus, OrderStatus[]> AllowedTransitions = new()
    {
        [OrderStatus.Pending]      = [OrderStatus.Paid,         OrderStatus.Cancelled],
        [OrderStatus.Paid]         = [OrderStatus.Reviewing,    OrderStatus.Cancelled],
        [OrderStatus.Reviewing]    = [OrderStatus.Printing,     OrderStatus.Cancelled],
        [OrderStatus.Printing]     = [OrderStatus.Ready,        OrderStatus.Cancelled],
        [OrderStatus.Ready]        = [OrderStatus.Completed],
        [OrderStatus.Completed]    = [],
        // ── Legacy paths kept for compatibility ──────────────────────────────
        // ── Terminal ─────────────────────────────────────────────────────────
        [OrderStatus.Cancelled]    = [],
    };

    public string OrderNumber { get; private set; } = default!;
    public OrderStatus Status { get; private set; } = OrderStatus.Pending;
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = default!;
    public string CustomerEmail { get; set; } = default!;
    public ShippingAddress ShippingAddress { get; set; } = default!;
    public decimal TotalAmount { get; private set; }
    public string? Notes { get; set; }
    public string? AdminNotes { get; set; }
    public bool IsApprovedForPrinting { get; private set; }
    public bool IsDesignReviewed { get; private set; }
    public bool IsPrintPositionConfirmed { get; private set; }
    public bool IsFileDownloaded { get; private set; }
    public bool IsGarmentConfirmed { get; private set; }
    public bool IsReadyToPrint { get; private set; }
    public DeliveryMethod? DeliveryMethod { get; set; }

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
        if (Status == newStatus)
        {
            return;
        }

        if (!AllowedTransitions.TryGetValue(Status, out var allowedStatuses) || !allowedStatuses.Contains(newStatus))
        {
            throw new BusinessException("TeeNova:Order:InvalidStatusTransition")
                .WithData("CurrentStatus", Status)
                .WithData("RequestedStatus", newStatus);
        }

        Status = newStatus;
    }

    public void ApproveForPrinting()
    {
        if (Status != OrderStatus.Reviewing)
        {
            throw new BusinessException("TeeNova:Order:CannotApproveForPrinting")
                .WithData("CurrentStatus", Status);
        }

        IsApprovedForPrinting = true;
    }

    public void StartPrinting()
    {
        if (Status != OrderStatus.Reviewing || !IsApprovedForPrinting)
        {
            throw new BusinessException("TeeNova:Order:CannotStartPrinting")
                .WithData("CurrentStatus", Status)
                .WithData("IsApprovedForPrinting", IsApprovedForPrinting);
        }

        Status = OrderStatus.Printing;
    }

    public void MarkReady()
    {
        if (Status != OrderStatus.Printing)
        {
            throw new BusinessException("TeeNova:Order:CannotMarkReady")
                .WithData("CurrentStatus", Status);
        }

        Status = OrderStatus.Ready;
    }

    public void Complete()
    {
        if (Status != OrderStatus.Ready)
        {
            throw new BusinessException("TeeNova:Order:CannotComplete")
                .WithData("CurrentStatus", Status);
        }

        Status = OrderStatus.Completed;
    }

    public void UpdatePreparationChecklist(
        bool isDesignReviewed,
        bool isPrintPositionConfirmed,
        bool isFileDownloaded,
        bool isGarmentConfirmed,
        bool isReadyToPrint)
    {
        IsDesignReviewed = isDesignReviewed;
        IsPrintPositionConfirmed = isPrintPositionConfirmed;
        IsFileDownloaded = isFileDownloaded;
        IsGarmentConfirmed = isGarmentConfirmed;
        IsReadyToPrint = isReadyToPrint;
    }

    public void Reopen(DateTime now)
    {
        if (Status != OrderStatus.Cancelled)
        {
            throw new BusinessException("TeeNova:Order:CannotReopen")
                .WithData("CurrentStatus", Status);
        }

        var cancelledAt = NormalizeToUtc(LastModificationTime ?? CreationTime);
        var currentTime = NormalizeToUtc(now);
        var elapsed = currentTime - cancelledAt;

        if (elapsed < TimeSpan.Zero)
        {
            elapsed = TimeSpan.Zero;
        }

        if (elapsed > ReopenWindow)
        {
            throw new BusinessException("TeeNova:Order:ReopenWindowExpired")
                .WithData("CancelledAt", cancelledAt)
                .WithData("ReopenWindowHours", ReopenWindow.TotalHours);
        }

        Status = OrderStatus.Pending;
    }

    private void RecalculateTotal()
    {
        TotalAmount = _items.Sum(i => i.UnitPrice * i.Quantity);
    }

    private static DateTime NormalizeToUtc(DateTime value)
    {
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
    }

    private static string GenerateOrderNumber(Guid id) =>
        $"TN-{id.ToString("N")[..8].ToUpper()}";
}
