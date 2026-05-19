namespace TeeNova.Orders;

public enum PaymentStatus
{
    Unpaid = 0,           // No payment received
    DepositRequired = 1,  // Pickup order: deposit threshold not yet met
    DepositPaid = 2,      // Deposit threshold met, balance still owed
    PartiallyPaid = 3,    // Some payment received but below deposit threshold
    Paid = 4,             // Full amount received
    Refunded = 5,         // Deferred — future use
    PaymentFailed = 6,    // Deferred — future provider use
}
