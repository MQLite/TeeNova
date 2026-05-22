using TeeNova.Payments;

namespace TeeNova.Orders.Dtos;

public class CreateOnlinePaymentSessionDto
{
    /// <summary>
    /// Provider to use for this session. If null or None, the server uses OnlinePaymentOptions.DefaultProvider.
    /// </summary>
    public PaymentProvider? Provider { get; set; }

    /// <summary>
    /// Payment purpose hint from the client. Server validates and may override based on order state.
    /// If null, the server derives the correct purpose from the order's payment state.
    /// </summary>
    public PaymentPurpose? Purpose { get; set; }
}
