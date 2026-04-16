namespace TeeNova.Files;

/// <summary>
/// Identifies the category of an uploaded asset, controlling storage folder
/// and cleanup eligibility.
/// </summary>
public enum AssetType
{
    /// <summary>
    /// Customer-uploaded print design file.
    /// Stored under uploads/designs/.
    /// Subject to orphan detection and automatic cleanup.
    /// </summary>
    CustomerDesign = 0,

    /// <summary>
    /// Admin-uploaded product catalog image.
    /// Stored under uploads/products/.
    /// NOT subject to orphan cleanup — managed manually.
    /// </summary>
    ProductImage = 1,
}
