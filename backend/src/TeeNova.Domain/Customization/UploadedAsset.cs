using System;
using TeeNova.Files;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Customization;

/// <summary>
/// Represents an uploaded file tracked by the system.
/// Customer print design files are <see cref="AssetType.CustomerDesign"/>;
/// product catalog images are <see cref="AssetType.ProductImage"/>.
///
/// Only <see cref="AssetType.CustomerDesign"/> records are eligible for orphan cleanup.
/// </summary>
public class UploadedAsset : AuditedAggregateRoot<Guid>
{
    public string OriginalFileName { get; set; } = default!;
    public string StoredFileUrl { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long FileSizeBytes { get; set; }
    public Guid? UserId { get; set; }
    public AssetType AssetType { get; set; } = AssetType.CustomerDesign;

    // Future: ThumbnailUrl, Width, Height, ColorProfile

    protected UploadedAsset() { }

    public UploadedAsset(
        Guid id,
        string originalFileName,
        string storedFileUrl,
        string contentType,
        long fileSizeBytes,
        AssetType assetType = AssetType.CustomerDesign)
        : base(id)
    {
        OriginalFileName = originalFileName;
        StoredFileUrl = storedFileUrl;
        ContentType = contentType;
        FileSizeBytes = fileSizeBytes;
        AssetType = assetType;
    }
}
