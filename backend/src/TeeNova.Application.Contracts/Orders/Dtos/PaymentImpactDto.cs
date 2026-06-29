namespace TeeNova.Orders.Dtos;

/// <summary>
/// Preview of how an order-content change would affect the order's payment snapshot (Jira 9405),
/// computed WITHOUT persisting. Mirrors the recalculation <c>Order.AdjustPrice</c> performs on save:
/// PaidAmount and PaymentTransaction records are never altered by repricing.
/// </summary>
public class PaymentImpactDto
{
    /// <summary>Amount already paid (unchanged by repricing).</summary>
    public decimal PaidAmount { get; set; }

    public decimal OldBalanceAmount { get; set; }
    public decimal NewBalanceAmount { get; set; }

    public decimal OldRequiredPaymentAmount { get; set; }
    public decimal NewRequiredPaymentAmount { get; set; }

    public decimal? OldRequiredDepositAmount { get; set; }
    public decimal? NewRequiredDepositAmount { get; set; }

    public string CurrentPaymentStatus { get; set; } = default!;
    public string PreviewPaymentStatus { get; set; } = default!;

    /// <summary>True when the new total differs from the current total.</summary>
    public bool TotalChanged { get; set; }

    /// <summary>True when saving would cancel one or more Pending online payment sessions.</summary>
    public bool WouldCancelPendingPaymentSessions { get; set; }

    /// <summary>True when the change cannot be saved as-is (see <see cref="BlockingReasons"/>).</summary>
    public bool IsBlocked { get; set; }

    /// <summary>Machine-friendly blocking reason codes (e.g. "NewTotalBelowPaidAmount", "OrderCancelled").</summary>
    public System.Collections.Generic.List<string> BlockingReasons { get; set; } = new();
}
