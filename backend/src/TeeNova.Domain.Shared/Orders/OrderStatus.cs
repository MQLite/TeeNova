namespace TeeNova.Orders;

public enum OrderStatus
{
    Pending = 0,        // Created, awaiting payment confirmation
    Confirmed = 1,      // Legacy status kept for compatibility
    InProduction = 2,   // Production job active (legacy)
    Shipped = 3,        // Dispatched to customer (legacy)
    Delivered = 4,      // Delivery confirmed (legacy)
    Cancelled = 5,      // Cancelled before production
    Paid = 6,           // Payment has been confirmed
    Reviewing = 7,      // Admin is reviewing artwork before printing
    Printing = 8,       // Physical printing in progress
    Ready = 9,          // Printed and ready for pickup / dispatch
    Completed = 10,     // Order handed over and finalised
}
