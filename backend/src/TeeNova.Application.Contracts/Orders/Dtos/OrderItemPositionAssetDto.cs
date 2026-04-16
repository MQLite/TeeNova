using System;
using TeeNova.Customization;

namespace TeeNova.Orders.Dtos;

public class OrderItemPositionAssetDto
{
    public Guid Id { get; set; }
    public PrintPosition Position { get; set; }
    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote { get; set; }

    /// <summary>Populated from UploadedAsset — null when no file is attached.</summary>
    public string? OriginalFileName { get; set; }

    /// <summary>Populated from UploadedAssetUrl — null when no file is attached.</summary>
    public string? FileName { get; set; }

    /// <summary>Populated from UploadedAsset — null when no file is attached.</summary>
    public long? FileSizeBytes { get; set; }
}
