namespace TeeNova.Orders;

public enum ManualPaymentMethod
{
    Cash = 0,
    Eftpos = 1,
    BankTransfer = 2,
    Online = 3, // Provider-neutral slot for future payment provider transactions
    Other = 4,
}
