using System;
using TeeNova.Customization;

namespace TeeNova.Orders.Dtos;

public class UpdateOrderItemDesignDto
{
    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    /// <summary>Optional — full replacement of multi-position JSON. Null = leave unchanged.</summary>
    public string? PrintPositionsJson { get; set; }
    public PrintPosition? Position { get; set; }
    public string? DesignNote { get; set; }
}
