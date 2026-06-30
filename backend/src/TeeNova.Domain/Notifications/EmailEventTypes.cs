namespace TeeNova.Notifications;

public static class EmailEventTypes
{
    public const string CustomerOrderConfirmation = "CustomerOrderConfirmation";
    public const string AdminNewOrder             = "AdminNewOrder";
    public const string ReadyForPickup            = "ReadyForPickup";
    public const string OrderCompleted            = "OrderCompleted";
    public const string PaymentRecorded           = "PaymentRecorded";

    // Banner quote enquiries (Jira 9513). Logged against the BannerQuoteRequest id (reusing the
    // EmailNotificationLog.OrderId column as the related-entity key).
    public const string AdminNewBannerEnquiry              = "AdminNewBannerEnquiry";
    public const string CustomerBannerEnquiryAcknowledgement = "CustomerBannerEnquiryAcknowledgement";
}
