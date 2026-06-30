namespace TeeNova.Orders;

/// <summary>
/// Banner substrate/material (Jira 9511). Stored as a string on <c>OrderItemBannerDetail</c>.
/// <see cref="Other"/> allows a free-text material name via <c>MaterialDisplayName</c>.
/// </summary>
public enum BannerMaterial
{
    /// <summary>Roll-up / pull-up banner stock.</summary>
    PullUp = 0,

    /// <summary>PVC vinyl banner.</summary>
    Pvc = 1,

    /// <summary>Mesh banner (wind-permeable).</summary>
    Mesh = 2,

    /// <summary>Fabric banner.</summary>
    Fabric = 3,

    /// <summary>Any other material; see <c>MaterialDisplayName</c> for the free-text label.</summary>
    Other = 4,
}
