using System.Threading.Tasks;
using TeeNova.Orders;

namespace TeeNova.Email;

public interface IOrderEmailNotificationService
{
    Task SendOrderConfirmationAsync(Order order);
    Task SendAdminNewOrderNotificationAsync(Order order);
    Task SendOrderReadyAsync(Order order);
    Task SendOrderCompletedAsync(Order order);
    /// <summary>
    /// Sends the customer payment receipt. <paramref name="surcharge"/> is supplied only for an online
    /// payment that included a card-processing surcharge (Phase 3), so the receipt can show the commercial
    /// amount, the surcharge and the total actually charged. Null keeps the pre-existing single-amount
    /// receipt for every manual and legacy online payment.
    /// </summary>
    Task SendPaymentReceiptAsync(
        Order                          order,
        PaymentTransaction             transaction,
        PaymentSurchargeReceiptDetail? surcharge = null);
}

/// <summary>
/// Non-secret surcharge breakdown for a payment receipt. <c>ChargedAmount</c> is what the customer's card was
/// charged; <c>BaseAmount</c> is the commercial amount applied to the order.
/// </summary>
public sealed record PaymentSurchargeReceiptDetail(
    decimal BaseAmount,
    decimal SurchargeAmount,
    decimal ChargedAmount,
    string  Currency);
