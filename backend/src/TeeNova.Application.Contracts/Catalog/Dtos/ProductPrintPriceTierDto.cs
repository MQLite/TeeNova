using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using TeeNova.Catalog;

namespace TeeNova.Catalog.Dtos;

/// <summary>Read model for a print-only quantity-break price rule (Jira 9203).</summary>
public class ProductPrintPriceTierDto
{
    public Guid Id { get; set; }

    public Guid PrintPricingGroupId { get; set; }

    /// <summary>Null = group default. Non-null = override for a garment size (ProductVariant.Size).</summary>
    public string? Size { get; set; }

    public Guid PrintSizeId { get; set; }
    public int MinQuantity { get; set; }
    public decimal UnitPrintPrice { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>One tier row in a <see cref="SetProductPrintPriceTiersDto"/> replace payload.</summary>
public class CreateUpdateProductPrintPriceTierDto
{
    /// <summary>Null = group default. Non-null must match at least one ProductVariant.Size in the group.</summary>
    [StringLength(CatalogConsts.MaxSizeLength)]
    public string? Size { get; set; }

    [Required]
    public Guid PrintSizeId { get; set; }

    [Range(1, 100000)]
    public int MinQuantity { get; set; }

    [Range(0.01, 999999)]
    public decimal UnitPrintPrice { get; set; }

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

/// <summary>
/// Replace-the-whole-set payload for a group's print price tiers (single-writer endpoint). Sending
/// an empty list clears all of the group's print tiers (printing then falls back to PrintSize.BasePrice).
/// </summary>
public class SetProductPrintPriceTiersDto
{
    [Required]
    public List<CreateUpdateProductPrintPriceTierDto> Tiers { get; set; } = new();
}
