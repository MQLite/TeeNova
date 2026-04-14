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
}
