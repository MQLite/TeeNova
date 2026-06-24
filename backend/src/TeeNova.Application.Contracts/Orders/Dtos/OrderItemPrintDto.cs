using System;

namespace TeeNova.Orders.Dtos;

public class OrderItemPrintDto
{
    public Guid Id { get; set; }

    public Guid PrintAreaId { get; set; }
    public string PrintAreaName { get; set; } = default!;
    public string PrintAreaCode { get; set; } = default!;
    public decimal PrintAreaPrice { get; set; }

    public Guid PrintSizeId { get; set; }
    public string PrintSizeName { get; set; } = default!;
    public string PrintSizeCode { get; set; } = default!;
    public decimal PrintSizePrice { get; set; }

    /// <summary>The print price actually charged at placement (Jira 9203 print-only model).</summary>
    public decimal ResolvedUnitPrintPrice { get; set; }

    /// <summary>Applied print-tier MinQuantity, or null when base-price fallback was used.</summary>
    public int? AppliedPrintTierMinQuantity { get; set; }

    public int SortOrder { get; set; }
    public string? Notes { get; set; }

    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote { get; set; }
}
