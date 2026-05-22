namespace TeeNova.Payments;

public enum OnlinePaymentSessionStatus
{
    Pending   = 0,
    Completed = 1,
    Cancelled = 2,
    Expired   = 3,
    Failed    = 4,
}
