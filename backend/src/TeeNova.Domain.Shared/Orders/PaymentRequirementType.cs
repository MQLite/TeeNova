namespace TeeNova.Orders;

public enum PaymentRequirementType
{
    DepositThenBalance = 0,  // Pickup: 50% deposit now, balance at pickup
    FullPaymentRequired = 1, // Shipping: 100% upfront
}
