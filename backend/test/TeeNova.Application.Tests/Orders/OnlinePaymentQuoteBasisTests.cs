using System;
using TeeNova.Payments;
using Volo.Abp;

namespace TeeNova.Orders;

/// <summary>
/// The trusted commercial base a payment quote is built on (Phase 3). Both quote endpoints derive it from
/// the SAME server-side rules the live payment path uses — the draft case by running the real domain
/// payment-requirement initialisation over a server-priced total, never a browser-supplied amount.
/// </summary>
public sealed class OnlinePaymentQuoteBasisTests
{
    // ── Draft (order not created yet) ─────────────────────────────────────────

    [Fact]
    public void Draft_shipping_quote_uses_the_full_priced_total()
    {
        var (purpose, amount) = OrderAppService.CalculateDraftPaymentPurposeAndAmount(
            totalAmount: 249.90m, DeliveryMethod.Shipping);

        Assert.Equal(PaymentPurpose.FullPayment, purpose);
        Assert.Equal(249.90m, amount);
    }

    [Fact]
    public void Draft_pickup_quote_uses_the_required_deposit()
    {
        var (purpose, amount) = OrderAppService.CalculateDraftPaymentPurposeAndAmount(
            totalAmount: 200.00m, DeliveryMethod.Pickup);

        Assert.Equal(PaymentPurpose.Deposit, purpose);
        Assert.Equal(100.00m, amount);
    }

    [Fact]
    public void Draft_pickup_deposit_rounds_up_to_whole_cents_exactly_as_the_domain_does()
    {
        var (_, amount) = OrderAppService.CalculateDraftPaymentPurposeAndAmount(
            totalAmount: 99.99m, DeliveryMethod.Pickup);

        // Domain rule: ceiling(total × 50%) to the cent — 49.995 → 50.00.
        Assert.Equal(50.00m, amount);
        Assert.Equal(50.00m, Order.CreateDraftForPaymentQuote(99.99m, DeliveryMethod.Pickup).RequiredDepositAmount);
    }

    [Fact]
    public void Draft_quote_matches_what_the_created_order_will_require()
    {
        var draft = Order.CreateDraftForPaymentQuote(200.00m, DeliveryMethod.Pickup);

        var (purpose, amount) = OrderAppService.CalculateDraftPaymentPurposeAndAmount(
            totalAmount: 200.00m, DeliveryMethod.Pickup);

        Assert.Equal(draft.RequiredDepositAmount, amount);
        Assert.Equal(PaymentPurpose.Deposit, purpose);
        Assert.Equal(PaymentRequirementType.DepositThenBalance, draft.PaymentRequirementType);
        Assert.Equal(200.00m, draft.TotalAmount);
        Assert.Equal(0m, draft.PaidAmount);
    }

    [Fact]
    public void Draft_quote_without_a_delivery_method_fails_closed()
    {
        var ex = Assert.Throws<BusinessException>(
            () => OrderAppService.CalculateDraftPaymentPurposeAndAmount(100.00m, deliveryMethod: null));

        Assert.Equal("TeeNova:Payment:OnlinePaymentInvalidOrderState", ex.Code);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-10.00)]
    public void Draft_quote_with_a_non_positive_total_fails_closed(decimal total)
    {
        var ex = Assert.Throws<BusinessException>(
            () => OrderAppService.CalculateDraftPaymentPurposeAndAmount(total, DeliveryMethod.Shipping));

        Assert.Equal("TeeNova:Payment:OnlinePaymentNoAmountDue", ex.Code);
    }

    [Fact]
    public void A_transient_draft_order_is_never_treated_as_a_real_order()
    {
        var draft = Order.CreateDraftForPaymentQuote(100.00m, DeliveryMethod.Shipping);

        Assert.Empty(draft.Items);
        Assert.Equal(string.Empty, draft.CustomerEmail);
        Assert.Equal(OrderStatus.Pending, draft.Status);
    }

    // ── Existing order ────────────────────────────────────────────────────────

    [Fact]
    public void Existing_shipping_order_quotes_the_current_balance()
    {
        var order = Order.CreateDraftForPaymentQuote(300.00m, DeliveryMethod.Shipping);
        order.ApplyPayment(100.00m, ManualPaymentMethod.Cash, null, null, DateTime.UtcNow);

        var (purpose, amount) = OrderAppService.CalculatePaymentPurposeAndAmount(order, null);

        Assert.Equal(PaymentPurpose.FullPayment, purpose);
        Assert.Equal(200.00m, amount);
    }

    [Fact]
    public void Existing_pickup_order_quotes_the_outstanding_deposit_first()
    {
        var order = Order.CreateDraftForPaymentQuote(200.00m, DeliveryMethod.Pickup);
        order.ApplyPayment(40.00m, ManualPaymentMethod.Cash, null, null, DateTime.UtcNow);

        var (purpose, amount) = OrderAppService.CalculatePaymentPurposeAndAmount(order, null);

        Assert.Equal(PaymentPurpose.Deposit, purpose);
        Assert.Equal(60.00m, amount); // 100.00 required deposit − 40.00 already paid
    }

    [Fact]
    public void Existing_pickup_order_quotes_the_balance_once_the_deposit_is_met()
    {
        var order = Order.CreateDraftForPaymentQuote(200.00m, DeliveryMethod.Pickup);
        order.ApplyPayment(100.00m, ManualPaymentMethod.Cash, null, null, DateTime.UtcNow);

        var (purpose, amount) = OrderAppService.CalculatePaymentPurposeAndAmount(order, null);

        Assert.Equal(PaymentPurpose.Balance, purpose);
        Assert.Equal(100.00m, amount);
    }

    [Fact]
    public void A_fully_paid_order_cannot_be_quoted()
    {
        var order = Order.CreateDraftForPaymentQuote(100.00m, DeliveryMethod.Shipping);
        order.ApplyPayment(100.00m, ManualPaymentMethod.Cash, null, null, DateTime.UtcNow);

        var ex = Assert.Throws<BusinessException>(
            () => OrderAppService.CalculatePaymentPurposeAndAmount(order, null));

        Assert.Equal("TeeNova:Payment:OnlinePaymentNoAmountDue", ex.Code);
    }

    [Fact]
    public void A_mismatched_purpose_hint_is_refused()
    {
        var order = Order.CreateDraftForPaymentQuote(100.00m, DeliveryMethod.Shipping);

        var ex = Assert.Throws<BusinessException>(
            () => OrderAppService.CalculatePaymentPurposeAndAmount(order, PaymentPurpose.Deposit));

        Assert.Equal("TeeNova:Payment:OnlinePaymentInvalidPurpose", ex.Code);
    }

    // ── The surcharge is applied to the commercial base only ──────────────────

    [Fact]
    public void A_surcharge_is_never_compounded_on_an_earlier_surcharge()
    {
        // First attempt: deposit of 100.00 quoted at 103.04 charged.
        var order = Order.CreateDraftForPaymentQuote(200.00m, DeliveryMethod.Pickup);
        var first = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true), 100.00m);

        Assert.Equal(103.04m, first.ChargedAmount);

        // Only the BASE is applied to the order, so the next quote is calculated on the remaining
        // commercial balance — never on a total that already contains a surcharge.
        order.ApplyPayment(first.BaseAmount, ManualPaymentMethod.Online, "pi_1", null, DateTime.UtcNow);

        var (purpose, amount) = OrderAppService.CalculatePaymentPurposeAndAmount(order, null);
        Assert.Equal(PaymentPurpose.Balance, purpose);
        Assert.Equal(100.00m, amount);

        var second = StripePaymentQuoteServiceTests.Build(
            StripePaymentQuoteServiceTests.Settings(enabled: true), amount);

        Assert.Equal(100.00m, second.BaseAmount);
        Assert.Equal(103.04m, second.ChargedAmount);
    }
}
