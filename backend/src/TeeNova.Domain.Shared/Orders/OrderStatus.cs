namespace TeeNova.Orders;

public enum OrderStatus
{
    Pending = 0,        // Created, awaiting payment confirmation
    Confirmed = 1,      // Payment confirmed, sent to production
    InProduction = 2,   // Production job active
    Shipped = 3,        // Dispatched to customer
    Delivered = 4,      // Delivery confirmed
    Cancelled = 5       // Cancelled before production
}
