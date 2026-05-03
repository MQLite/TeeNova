namespace TeeNova.Customization;

/// <summary>
/// Represents available print areas on a garment.
/// </summary>
/// <remarks>
/// This enum is the legacy source of truth for print position data.
/// New code should prefer the <c>PrintArea</c> entity in the PrintConfig module,
/// which stores the same data as admin-configurable database records.
/// <c>PrintArea.LegacyPositionValue</c> maps each record back to this enum's integer values.
/// Full migration from this enum to <c>PrintAreaId</c> references is deferred to a future phase.
/// Do not remove this enum until <c>OrderItemPositionAsset.Position</c> has been migrated.
/// </remarks>
public enum PrintPosition
{
    FrontCenter = 0,
    BackCenter = 1,
    LeftChest = 2,
    RightChest = 3,
    LeftSleeve = 4,
    RightSleeve = 5,
    NeckLabel = 6
}
