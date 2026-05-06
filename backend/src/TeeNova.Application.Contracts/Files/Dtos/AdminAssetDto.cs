using System;

namespace TeeNova.Files.Dtos;

public class AdminAssetDto
{
    public Guid Id { get; set; }
    public string OriginalFileName { get; set; } = default!;
    public string FileUrl { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long FileSizeBytes { get; set; }
    public DateTime CreationTime { get; set; }

    // ── Linked order (null when asset is not referenced by any order item) ─────
    public Guid? LinkedOrderId { get; set; }
    public string? LinkedOrderNumber { get; set; }
    public string? LinkedCustomerName { get; set; }
    public Guid? LinkedOrderItemId { get; set; }
    public string? LinkedProductName { get; set; }
    public string? PrintAreaName { get; set; }
    public string? DesignNote { get; set; }
}
