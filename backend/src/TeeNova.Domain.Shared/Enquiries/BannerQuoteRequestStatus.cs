namespace TeeNova.Enquiries;

/// <summary>
/// Lifecycle of a Banner quote enquiry (Jira 9512). Stored as a string. A quote request is NOT an order
/// and carries no payment/production state — it is a captured customer requirement awaiting a manual quote.
/// </summary>
public enum BannerQuoteRequestStatus
{
    /// <summary>Just submitted by the customer; awaiting admin review.</summary>
    New = 0,

    /// <summary>An admin has reviewed the enquiry.</summary>
    Reviewed = 1,

    /// <summary>An admin created a priced order from this enquiry (see <c>ConvertedOrderId</c>).</summary>
    ConvertedToOrder = 2,

    /// <summary>The enquiry was declined/abandoned.</summary>
    Cancelled = 3,
}
