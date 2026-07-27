using System;
using TeeNova.Orders;

namespace TeeNova.Email;

/// <summary>
/// Payment receipt safeguard (Phase 3). <c>PaymentTransaction.Amount</c> is the COMMERCIAL amount, so a
/// surcharged receipt must not present it as the total charged. A legacy payment keeps its existing output.
/// </summary>
public sealed class PaymentReceiptSurchargeTests
{
    [Fact]
    public void Surcharge_aware_receipt_shows_all_three_amounts()
    {
        var (_, html, text) = Build(
            commercialAmount: 100.00m,
            surcharge: new PaymentSurchargeReceiptDetail(100.00m, 3.04m, 103.04m, "NZD"));

        foreach (var body in new[] { html, text })
        {
            Assert.Contains("100.00", body);
            Assert.Contains("3.04",   body);
            Assert.Contains("103.04", body);
        }

        Assert.Contains("Card Processing Surcharge", html);
        Assert.Contains("Total Charged", html);
        Assert.Contains("Order Payment", html);

        Assert.Contains("Card Surcharge", text);
        Assert.Contains("Total Charged", text);
        Assert.Contains("Order Payment", text);
    }

    [Fact]
    public void Surcharge_aware_receipt_never_labels_the_transaction_amount_as_the_total_paid()
    {
        var (_, html, text) = Build(
            commercialAmount: 100.00m,
            surcharge: new PaymentSurchargeReceiptDetail(100.00m, 3.04m, 103.04m, "NZD"));

        Assert.DoesNotContain("Payment Amount", html);
        Assert.DoesNotContain("Payment Amount", text);
    }

    [Fact]
    public void The_displayed_total_charged_equals_base_plus_surcharge()
    {
        var detail = new PaymentSurchargeReceiptDetail(100.00m, 3.04m, 103.04m, "NZD");

        Assert.Equal(detail.ChargedAmount, detail.BaseAmount + detail.SurchargeAmount);
    }

    [Fact]
    public void The_surcharge_is_not_described_as_product_revenue()
    {
        var (_, html, _) = Build(
            commercialAmount: 100.00m,
            surcharge: new PaymentSurchargeReceiptDetail(100.00m, 3.04m, 103.04m, "NZD"));

        // The order total on the receipt still reflects the commercial order only.
        Assert.Contains("Order Total", html);
        Assert.DoesNotContain("103.04</td></tr><tr><td>Order Total", html.Replace(" ", string.Empty));
    }

    [Fact]
    public void Legacy_payment_preserves_the_existing_receipt_output()
    {
        var (_, html, text) = Build(commercialAmount: 120.50m, surcharge: null);

        Assert.Contains("Payment Amount", html);
        Assert.Contains("Payment Amount", text);
        Assert.Contains("120.50", html);
        Assert.DoesNotContain("Surcharge", html);
        Assert.DoesNotContain("Surcharge", text);
        Assert.DoesNotContain("Total Charged", html);
    }

    private static (string Subject, string Html, string Text) Build(
        decimal commercialAmount, PaymentSurchargeReceiptDetail? surcharge)
    {
        var order = Order.CreateDraftForPaymentQuote(200.00m, DeliveryMethod.Pickup);
        order.CustomerEmail = "customer@example.test";
        order.CustomerName  = "Test Customer";
        order.ApplyPayment(commercialAmount, ManualPaymentMethod.Online, "pi_1", null, DateTime.UtcNow);

        var transaction = new PaymentTransaction(
            Guid.NewGuid(), order.Id, commercialAmount, ManualPaymentMethod.Online, "pi_1", null);

        return OrderEmailTemplates.BuildPaymentReceiptEmail(
            order, transaction, new EmailSettingsSnapshot(), surcharge);
    }
}
