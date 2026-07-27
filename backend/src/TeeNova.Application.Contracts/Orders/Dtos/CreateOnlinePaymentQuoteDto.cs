using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using TeeNova.Payments;

namespace TeeNova.Orders.Dtos;

/// <summary>
/// Request for a payment quote on an EXISTING order (Phase 3). Carries a provider selection and the same
/// optional payment-purpose hint the session-creation flow already accepts — and nothing else. Every
/// monetary value is derived server-side from the current order state.
/// </summary>
public class CreateOnlinePaymentQuoteDto
{
    /// <summary>Provider to quote. If null or None, the server uses OnlinePaymentOptions.DefaultProvider.</summary>
    public PaymentProvider? Provider { get; set; }

    /// <summary>Purpose hint. The server validates it against the order's payment state and may reject it.</summary>
    public PaymentPurpose? Purpose { get; set; }
}

/// <summary>
/// Request for a payment quote on an order that does NOT exist yet (Phase 3), so the storefront can disclose
/// a card-processing surcharge before the customer commits.
///
/// Pricing-relevant fields only: product/variant references, quantities, design/customisation references and
/// the delivery method. There is deliberately no price, subtotal, delivery-cost or total field — the server
/// prices the draft through the same authoritative path used by real order creation — and no customer PII,
/// because none of it affects pricing.
/// </summary>
public class CreateDraftOnlinePaymentQuoteDto
{
    /// <summary>Provider to quote. If null or None, the server uses OnlinePaymentOptions.DefaultProvider.</summary>
    public PaymentProvider? Provider { get; set; }

    /// <summary>Determines the payment requirement (Pickup = deposit first, Shipping = full payment).</summary>
    public DeliveryMethod? DeliveryMethod { get; set; }

    [Required, MinLength(1), MaxLength(OrderLimits.MaxDraftQuoteItems)]
    public List<CreateOrderItemDto> Items { get; set; } = new();
}
