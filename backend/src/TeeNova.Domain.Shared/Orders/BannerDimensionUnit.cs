namespace TeeNova.Orders;

/// <summary>
/// Unit of the Banner width/height values (Jira 9511). Stored as a string on
/// <c>OrderItemBannerDetail</c>. The unit is never inferred — it is captured explicitly so the
/// server-side area computation is unambiguous.
/// </summary>
public enum BannerDimensionUnit
{
    /// <summary>Millimetres.</summary>
    Mm = 0,

    /// <summary>Centimetres.</summary>
    Cm = 1,

    /// <summary>Metres.</summary>
    M = 2,
}
