using System;
using System.Collections.Generic;
using TeeNova.Orders;

namespace TeeNova.Orders.Dtos;

public class OrderDto
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = default!;
    public OrderStatus Status { get; set; }

    /// <summary>Customer-facing display label, abstracting internal statuses.</summary>
    public string DisplayStatus { get; set; } = default!;

    public bool IsApprovedForPrinting { get; set; }
    public DeliveryMethod? DeliveryMethod { get; set; }
    public string CustomerName { get; set; } = default!;
    public string CustomerEmail { get; set; } = default!;
    public decimal TotalAmount { get; set; }
    public ShippingAddressDto ShippingAddress { get; set; } = default!;
    public List<OrderItemDto> Items { get; set; } = new();
    public string? Notes { get; set; }
    public string? AdminNotes { get; set; }
    public DateTime CreationTime { get; set; }
    public List<OrderTimelineEntryDto> Timeline { get; set; } = new();

    // Payment fields
    public PaymentStatus PaymentStatus { get; set; }
    public PaymentRequirementType PaymentRequirementType { get; set; }
    public decimal? RequiredDepositAmount { get; set; }
    public decimal RequiredPaymentAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal BalanceAmount { get; set; }
    public DateTime? DepositPaidAt { get; set; }
    public DateTime? FullyPaidAt { get; set; }
    public ManualPaymentMethod? LastPaymentMethod { get; set; }
    public string? LastPaymentReference { get; set; }
    public string? LastPaymentNote { get; set; }
    public List<PaymentTransactionDto> PaymentTransactions { get; set; } = new();

    // Price adjustment history (chronological, oldest first)
    public List<OrderPriceAdjustmentDto> PriceAdjustments   { get; set; } = new();
    public bool                          HasPriceAdjustment  { get; set; }
    public DateTime?                     LastPriceAdjustedAt       { get; set; }
    public string?                       LastPriceAdjustmentReason { get; set; }
    public decimal?                      LastPriceAdjustmentAmount { get; set; }
}

public class ShippingAddressDto
{
    public string FullName { get; set; } = default!;
    public string AddressLine1 { get; set; } = default!;
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = default!;
    public string? State { get; set; }
    public string PostalCode { get; set; } = default!;
    public string Country { get; set; } = "NZ";
    public string? Phone { get; set; }
}
