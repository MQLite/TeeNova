using System;
using TeeNova.Orders;

namespace TeeNova.Orders.Dtos;

public class PaymentTransactionDto
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public decimal Amount { get; set; }
    public ManualPaymentMethod Method { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public DateTime CreationTime { get; set; }
}
