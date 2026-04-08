namespace TeeNova.Customization;

/// <summary>
/// Represents available print areas on a garment.
/// Extend as new product types (hoodies, bags) are supported.
/// </summary>
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
