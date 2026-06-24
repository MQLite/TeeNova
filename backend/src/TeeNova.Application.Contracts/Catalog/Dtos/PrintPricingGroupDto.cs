using System;
using System.ComponentModel.DataAnnotations;
using TeeNova.Catalog;

namespace TeeNova.Catalog.Dtos;

/// <summary>Read model for a print-pricing aggregation group (Jira 9203).</summary>
public class PrintPricingGroupDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public string Code { get; set; } = default!;
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>Create/update payload for a print-pricing group.</summary>
public class CreateUpdatePrintPricingGroupDto
{
    [Required]
    [StringLength(CatalogConsts.MaxPrintPricingGroupNameLength)]
    public string Name { get; set; } = default!;

    [Required]
    [StringLength(CatalogConsts.MaxPrintPricingGroupCodeLength)]
    public string Code { get; set; } = default!;

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
