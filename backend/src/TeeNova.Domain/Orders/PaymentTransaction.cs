using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Orders;

/// <summary>
/// Write-once record of a single payment event against an order.
/// Supports deposit + balance model; also the slot for future provider-originated transactions.
/// Never updated or deleted — corrections are recorded as separate entries in a future phase.
/// </summary>
public class PaymentTransaction : CreationAuditedEntity<Guid>
{
    public Guid OrderId { get; private set; }
    public decimal Amount { get; private set; }
    public ManualPaymentMethod Method { get; private set; }
    public string? Reference { get; private set; }
    public string? Note { get; private set; }

    protected PaymentTransaction() { }

    public PaymentTransaction(
        Guid id,
        Guid orderId,
        decimal amount,
        ManualPaymentMethod method,
        string? reference = null,
        string? note = null)
        : base(id)
    {
        OrderId = orderId;
        Amount = amount;
        Method = method;
        Reference = reference;
        Note = note;
    }
}
