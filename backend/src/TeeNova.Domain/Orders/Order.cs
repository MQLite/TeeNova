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
        [OrderStatus.Reviewing]    = [OrderStatus.Cancelled],
        [OrderStatus.Printing]     = [OrderStatus.Cancelled],
        [OrderStatus.Ready]        = [],
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
    public DeliveryMethod? DeliveryMethod { get; set; }

    // ── Payment snapshot fields ───────────────────────────────────────────────
    // Proper initialization (based on DeliveryMethod) is done in Phase 12A-2.
    // Defaults here ensure non-null DB constraints are satisfied for new rows.
    public PaymentStatus PaymentStatus { get; private set; } = PaymentStatus.Unpaid;
    public PaymentRequirementType PaymentRequirementType { get; private set; } = PaymentRequirementType.FullPaymentRequired;
    public decimal? RequiredDepositAmount { get; private set; }
    public decimal RequiredPaymentAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public decimal BalanceAmount { get; private set; }
    public DateTime? DepositPaidAt { get; private set; }
    public DateTime? FullyPaidAt { get; private set; }
    public ManualPaymentMethod? LastPaymentMethod { get; private set; }
    public string? LastPaymentReference { get; private set; }
    public string? LastPaymentNote { get; private set; }

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

    /// <summary>
    /// Creates a TRANSIENT order used solely to derive the payment requirement of a draft that has not been
    /// created yet (Phase 3 online payment quoting). It is never inserted, never returned to a caller and
    /// carries no items or customer data — its only purpose is to run the real
    /// <see cref="InitializePaymentRequirement"/> rules against a server-priced total, so the quote endpoint
    /// cannot drift from what the order will actually require the moment it is placed.
    /// </summary>
    public static Order CreateDraftForPaymentQuote(decimal totalAmount, DeliveryMethod? deliveryMethod)
    {
        if (totalAmount <= 0m)
            throw new ArgumentOutOfRangeException(
                nameof(totalAmount), totalAmount, "Draft total must be greater than zero.");

        var order = new Order(
            Guid.NewGuid(),
            string.Empty,
            string.Empty,
            new ShippingAddress(string.Empty, string.Empty, string.Empty, null, string.Empty, "NZ"))
        {
            DeliveryMethod = deliveryMethod,
        };

        order.TotalAmount = totalAmount;
        order.InitializePaymentRequirement();

        return order;
    }

    public void UpdateStatus(OrderStatus newStatus)
    {
        if (Status == newStatus)
        {
            return;
        }

        // Activation (→ Paid) is payment-gated and must go through Activate() so the payment-threshold
        // guard can never be bypassed by the generic status-update path (Jira 9807). Reject it here even
        // though the transition table lists Pending→Paid, so there is a single, guarded activation path.
        if (newStatus == OrderStatus.Paid)
        {
            throw new BusinessException("TeeNova:Order:UseActivateToMarkPaid")
                .WithData("CurrentStatus", Status);
        }

        if (!AllowedTransitions.TryGetValue(Status, out var allowedStatuses) || !allowedStatuses.Contains(newStatus))
        {
            throw new BusinessException("TeeNova:Order:InvalidStatusTransition")
                .WithData("CurrentStatus", Status)
                .WithData("RequestedStatus", newStatus);
        }

        Status = newStatus;
    }

    /// <summary>
    /// Activates a Pending order (Pending → Paid) once its payment threshold is met (Jira 9807). This is
    /// the ONLY path to <see cref="OrderStatus.Paid"/>; the generic <see cref="UpdateStatus"/> rejects a
    /// direct jump to Paid so the threshold guard here can never be bypassed. Idempotent when the order is
    /// already Paid. The threshold rule mirrors the delivery-method payment model:
    /// FullPaymentRequired orders must be fully Paid; DepositThenBalance (Pickup) orders must have met the
    /// required deposit.
    /// </summary>
    public void Activate(DateTime now)
    {
        if (Status == OrderStatus.Paid)
        {
            return;
        }

        if (Status != OrderStatus.Pending)
        {
            throw new BusinessException("TeeNova:Order:InvalidStatusTransition")
                .WithData("CurrentStatus", Status)
                .WithData("RequestedStatus", OrderStatus.Paid);
        }

        EnsurePaymentThresholdMet();

        Status = OrderStatus.Paid;
    }

    /// <summary>
    /// Enforces the delivery-method payment threshold required to activate the order. Throws the same
    /// BusinessException codes the admin activation flow has always used. Kept in the domain so every
    /// activation path (admin mark-paid, and any future caller) is guarded identically (Jira 9807).
    /// </summary>
    private void EnsurePaymentThresholdMet()
    {
        if (PaymentRequirementType == PaymentRequirementType.FullPaymentRequired
            && PaymentStatus != PaymentStatus.Paid)
        {
            throw new BusinessException("TeeNova:Order:FullPaymentNotMet")
                .WithData("RequiredPaymentAmount", RequiredPaymentAmount)
                .WithData("PaidAmount", PaidAmount);
        }

        if (PaymentRequirementType == PaymentRequirementType.DepositThenBalance
            && PaidAmount < RequiredDepositAmount)
        {
            throw new BusinessException("TeeNova:Order:DepositPaymentNotMet")
                .WithData("RequiredDepositAmount", RequiredDepositAmount)
                .WithData("PaidAmount", PaidAmount);
        }
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

    public void InitializePaymentRequirement()
    {
        RequiredPaymentAmount = TotalAmount;

        if (DeliveryMethod == Orders.DeliveryMethod.Pickup)
        {
            PaymentRequirementType = PaymentRequirementType.DepositThenBalance;
            RequiredDepositAmount  = Math.Ceiling(TotalAmount * 0.50m * 100m) / 100m;
            PaymentStatus          = PaymentStatus.DepositRequired;
        }
        else
        {
            PaymentRequirementType = PaymentRequirementType.FullPaymentRequired;
            RequiredDepositAmount  = null;
            PaymentStatus          = PaymentStatus.Unpaid;
        }

        BalanceAmount        = TotalAmount;
        PaidAmount           = 0m;
        DepositPaidAt        = null;
        FullyPaidAt          = null;
        LastPaymentMethod    = null;
        LastPaymentReference = null;
        LastPaymentNote      = null;
    }

    public void ApplyPayment(decimal amount, ManualPaymentMethod method, string? reference, string? note, DateTime now)
    {
        // Domain-level terminal guard (Jira 9807): a cancelled/completed order must never accept a payment,
        // even if a stale balance remains (e.g. cancelled before payment). Both callers (admin
        // RecordPayment, webhook PaymentCompleted) already guard this; enforce it here so no future path
        // can apply money to a terminal order.
        if (Status == OrderStatus.Cancelled || Status == OrderStatus.Completed)
        {
            throw new BusinessException("TeeNova:Order:CannotApplyPaymentToTerminalOrder")
                .WithData("OrderId", Id)
                .WithData("Status", Status);
        }

        if (amount <= 0)
        {
            throw new BusinessException("TeeNova:Order:PaymentAmountMustBePositive")
                .WithData("Amount", amount);
        }

        if (amount > BalanceAmount)
        {
            throw new BusinessException("TeeNova:Order:PaymentExceedsBalance")
                .WithData("BalanceAmount", BalanceAmount)
                .WithData("Amount", amount);
        }

        PaidAmount          += amount;
        BalanceAmount        = RequiredPaymentAmount - PaidAmount;
        LastPaymentMethod    = method;
        LastPaymentReference = reference;
        LastPaymentNote      = note;

        RecalculatePaymentStatus(now);
    }

    /// <summary>
    /// Adjusts the order total to a new amount. Updates all dependent payment fields
    /// (RequiredPaymentAmount, RequiredDepositAmount, BalanceAmount, PaymentStatus)
    /// without touching PaidAmount or PaymentTransaction records.
    /// </summary>
    public void AdjustPrice(decimal newTotalAmount, DateTime now)
    {
        if (Status == OrderStatus.Cancelled || Status == OrderStatus.Completed)
            throw new BusinessException("TeeNova:Order:CannotAdjustPriceForTerminalOrder")
                .WithData("Status", Status);

        if (newTotalAmount <= 0)
            throw new BusinessException("TeeNova:Order:AdjustedTotalMustBePositive")
                .WithData("NewTotalAmount", newTotalAmount);

        if (newTotalAmount < PaidAmount)
            throw new BusinessException("TeeNova:Order:AdjustedTotalBelowPaidAmount")
                .WithData("PaidAmount", PaidAmount)
                .WithData("NewTotalAmount", newTotalAmount);

        ApplyTotalAndRecalculatePayment(newTotalAmount, now);
    }

    /// <summary>
    /// Replaces the order's entire item set from a server-priced draft (Jira 9405 admin content edit)
    /// and re-runs the SAME payment recalculation as <see cref="AdjustPrice"/> against the recomputed
    /// total. PaidAmount and PaymentTransaction records are never touched. Pass already-built items whose
    /// UnitPrice / print snapshots were produced by the authoritative pricing service — this method
    /// never computes prices itself (Epic 9200: backend pricing is authoritative).
    /// </summary>
    public void ReplaceItems(IEnumerable<OrderItem> newItems, DateTime now)
    {
        if (Status == OrderStatus.Cancelled || Status == OrderStatus.Completed)
            throw new BusinessException("TeeNova:Order:CannotEditContentForTerminalOrder")
                .WithData("Status", Status);

        var items = newItems?.ToList() ?? new List<OrderItem>();
        if (items.Count == 0)
            throw new BusinessException("TeeNova:Order:OrderMustHaveItems");

        _items.Clear();
        _items.AddRange(items);

        RecalculateTotal();

        if (TotalAmount <= 0)
            throw new BusinessException("TeeNova:Order:AdjustedTotalMustBePositive")
                .WithData("NewTotalAmount", TotalAmount);

        if (TotalAmount < PaidAmount)
            throw new BusinessException("TeeNova:Order:AdjustedTotalBelowPaidAmount")
                .WithData("PaidAmount", PaidAmount)
                .WithData("NewTotalAmount", TotalAmount);

        ApplyTotalAndRecalculatePayment(TotalAmount, now);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// <summary>
    /// Applies a new authoritative total to the payment snapshot (RequiredPaymentAmount,
    /// RequiredDepositAmount, BalanceAmount, PaymentStatus) without touching PaidAmount or any
    /// PaymentTransaction. Shared by <see cref="AdjustPrice"/> and <see cref="ReplaceItems"/> so the
    /// two paths recalculate payment identically; callers perform their own guard validation first.
    /// </summary>
    private void ApplyTotalAndRecalculatePayment(decimal newTotalAmount, DateTime now)
    {
        TotalAmount           = newTotalAmount;
        RequiredPaymentAmount = newTotalAmount;

        if (PaymentRequirementType == PaymentRequirementType.DepositThenBalance)
            RequiredDepositAmount = Math.Ceiling(newTotalAmount * 0.50m * 100m) / 100m;

        BalanceAmount = RequiredPaymentAmount - PaidAmount;

        RecalculatePaymentStatus(now);
    }

    /// <summary>
    /// Recalculates PaymentStatus, FullyPaidAt, and DepositPaidAt from the current
    /// PaidAmount vs RequiredPaymentAmount / RequiredDepositAmount. Safe to call
    /// from both ApplyPayment (payment added) and AdjustPrice (total changed).
    /// </summary>
    private void RecalculatePaymentStatus(DateTime now)
    {
        if (PaidAmount >= RequiredPaymentAmount)
        {
            PaymentStatus = PaymentStatus.Paid;
            if (FullyPaidAt == null) FullyPaidAt = now;
            if (DepositPaidAt == null
                && PaymentRequirementType == PaymentRequirementType.DepositThenBalance)
                DepositPaidAt = now;
        }
        else
        {
            // No longer fully paid — clear the fully-paid timestamp if it was set.
            FullyPaidAt = null;

            if (PaymentRequirementType == PaymentRequirementType.DepositThenBalance
                && RequiredDepositAmount.HasValue
                && PaidAmount >= RequiredDepositAmount.Value)
            {
                if (DepositPaidAt == null) DepositPaidAt = now;
                PaymentStatus = PaymentStatus.DepositPaid;
            }
            else if (PaidAmount > 0m)
            {
                // Deposit threshold not met (or N/A) — clear deposit timestamp.
                if (PaymentRequirementType == PaymentRequirementType.DepositThenBalance)
                    DepositPaidAt = null;
                PaymentStatus = PaymentStatus.PartiallyPaid;
            }
            else
            {
                if (PaymentRequirementType == PaymentRequirementType.DepositThenBalance)
                    DepositPaidAt = null;
                PaymentStatus = PaymentRequirementType == PaymentRequirementType.DepositThenBalance
                    ? PaymentStatus.DepositRequired
                    : PaymentStatus.Unpaid;
            }
        }
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
