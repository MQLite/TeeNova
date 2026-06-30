namespace TeeNova.Orders;

/// <summary>
/// How a Banner order item's size was specified (Jira 9511). Stored as a string on
/// <c>OrderItemBannerDetail</c>. <see cref="Preset"/> references a catalogued size (future FixedSize),
/// <see cref="Custom"/> carries customer-entered width/height.
/// </summary>
public enum BannerSizeMode
{
    /// <summary>A predefined/catalogued size (label and/or future <c>SizePresetId</c>).</summary>
    Preset = 0,

    /// <summary>Customer-entered width × height in a chosen <see cref="BannerDimensionUnit"/>.</summary>
    Custom = 1,
}
