namespace TeeNova.Orders;

public enum OrderStatus
{
    Pending = 0,        // Created, awaiting payment confirmation
    Cancelled = 1,      // Cancelled before production
    Paid = 2,           // Payment has been confirmed
    Reviewing = 3,      // Admin is reviewing artwork before printing
    Printing = 4,       // Physical printing in progress
    Ready = 5,          // Printed and ready for pickup / dispatch
    Completed = 6,      // Order handed over and finalised
}
