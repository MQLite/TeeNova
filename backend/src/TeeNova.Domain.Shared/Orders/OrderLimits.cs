namespace TeeNova.Orders;

/// <summary>
/// System-wide order limits (Jira 9803). Constants (not options) so they can be used in DTO
/// validation attributes; if the business ever needs a per-product or configurable ceiling,
/// promote the value to an options class and keep this as the hard upper bound.
/// </summary>
public static class OrderLimits
{
    /// <summary>
    /// Hard ceiling for a single order item's quantity, enforced both at the DTO boundary and in
    /// the authoritative pricing path. Generous for the shop's real bulk orders (garments/badges)
    /// while blocking nuisance/overflow-scale quantities.
    /// </summary>
    public const int MaxOrderItemQuantity = 1000;
}
