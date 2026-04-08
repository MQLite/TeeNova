using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Customization;

/// <summary>
/// Represents a user-uploaded design file (PNG, SVG, etc.).
/// The stored file URL points to the file storage service (local or cloud).
/// </summary>
public class UploadedAsset : AuditedAggregateRoot<Guid>
{
    public string OriginalFileName { get; set; } = default!;
    public string StoredFileUrl { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long FileSizeBytes { get; set; }
    public Guid? UserId { get; set; }

    // Future: ThumbnailUrl, Width, Height, ColorProfile, AIGeneratedMetadata

    protected UploadedAsset() { }

    public UploadedAsset(Guid id, string originalFileName, string storedFileUrl, string contentType, long fileSizeBytes)
        : base(id)
    {
        OriginalFileName = originalFileName;
        StoredFileUrl = storedFileUrl;
        ContentType = contentType;
        FileSizeBytes = fileSizeBytes;
    }
}
