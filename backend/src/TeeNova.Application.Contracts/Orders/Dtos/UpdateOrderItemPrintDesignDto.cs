using System;

namespace TeeNova.Orders.Dtos;

public class UpdateOrderItemPrintDesignDto
{
    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote { get; set; }
}
