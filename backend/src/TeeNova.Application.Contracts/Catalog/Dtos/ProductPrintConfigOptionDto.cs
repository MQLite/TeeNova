using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using TeeNova.Catalog;

namespace TeeNova.Catalog.Dtos;

/// <summary>Read model for a product/size scoped allowed print option (Jira 9204).</summary>
public class ProductPrintConfigOptionDto
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }

    /// <summary>Null = product default. Non-null = override for a garment size (ProductVariant.Size).</summary>
    public string? Size { get; set; }

    public Guid PrintAreaId { get; set; }
    public Guid PrintSizeId { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>One row in a <see cref="SetProductPrintConfigOptionsDto"/> replace payload.</summary>
public class CreateUpdateProductPrintConfigOptionDto
{
    /// <summary>Null = product default. Non-null must match at least one ProductVariant.Size of the product.</summary>
    [StringLength(CatalogConsts.MaxSizeLength)]
    public string? Size { get; set; }

    [Required]
    public Guid PrintAreaId { get; set; }

    [Required]
    public Guid PrintSizeId { get; set; }

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

/// <summary>
/// Replace-the-whole-set payload for a product's scoped allowed print options (single-writer
/// endpoint). Sending an empty list clears all scoped options (the product reverts to the global
/// PrintAreaSizeOption matrix).
/// </summary>
public class SetProductPrintConfigOptionsDto
{
    [Required]
    public List<CreateUpdateProductPrintConfigOptionDto> Options { get; set; } = new();
}
