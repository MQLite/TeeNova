namespace TeeNova.Catalog;

/// <summary>
/// Informational inventory state for a <see cref="ProductVariant"/>.
/// This is intentionally decoupled from sellability — <c>ProductVariant.IsAvailable</c>
/// remains the sole gate on whether a variant can be purchased. As of Jira 9002 this
/// status is display-only: it never blocks checkout, hides products, or deducts stock.
/// </summary>
public enum VariantInventoryStatus
{
    /// <summary>Inventory is unknown / not tracked (default).</summary>
    NotRecorded = 0,

    /// <summary>Stock is available — informational only.</summary>
    InStock = 1,

    /// <summary>Low stock — a manual status for MVP.</summary>
    LowStock = 2,

    /// <summary>Out of stock — informational only; does not block checkout.</summary>
    OutOfStock = 3,
}
