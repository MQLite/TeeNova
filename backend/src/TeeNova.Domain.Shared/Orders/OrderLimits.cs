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

    /// <summary>
    /// Hard ceiling on the number of item lines accepted by the anonymous draft payment-quote endpoint
    /// (Phase 3). The quote endpoint prices a whole draft without persisting anything, so it needs its own
    /// work bound in addition to the shared per-IP rate limit and request-size cap. Comfortably above any
    /// realistic cart while blocking a pricing-amplification payload.
    /// </summary>
    public const int MaxDraftQuoteItems = 50;
}
