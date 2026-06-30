using System;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Catalog.Dtos;

public class CreateProductDto
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = default!;

    [MaxLength(4000)]
    public string? Description { get; set; }

    [Required]
    [Range(0, 999999)]
    public decimal BasePrice { get; set; }

    [Required]
    [MaxLength(64)]
    public string ProductType { get; set; } = default!;

    public bool IsActive { get; set; } = true;

    /// <summary>Optional print-pricing group assignment (Jira 9203). Null = ungrouped.</summary>
    public Guid? PrintPricingGroupId { get; set; }

    /// <summary>Business category (Jira 9503). Defaults to Garment when omitted (backward compatible).</summary>
    public ProductKind Kind { get; set; } = ProductKind.Garment;

    /// <summary>Pricing behavior (Jira 9503). Defaults to GarmentPrint when omitted.</summary>
    public PricingModel PricingModel { get; set; } = PricingModel.GarmentPrint;

    /// <summary>Minimum sellable quantity (Jira 9503). Must be ≥ 1.</summary>
    [Range(1, 1000000)]
    public int MinimumQuantity { get; set; } = 1;

    /// <summary>When true, an order item for this product must carry a design asset (Jira 9503).</summary>
    public bool DesignUploadRequired { get; set; }
}

public class UpdateProductDto
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = default!;

    [MaxLength(4000)]
    public string? Description { get; set; }

    [Required]
    [Range(0, 999999)]
    public decimal BasePrice { get; set; }

    [Required]
    [MaxLength(64)]
    public string ProductType { get; set; } = default!;

    public bool IsActive { get; set; }

    /// <summary>Optional print-pricing group assignment (Jira 9203). Null = ungrouped.</summary>
    public Guid? PrintPricingGroupId { get; set; }

    /// <summary>Business category (Jira 9503). Defaults to Garment when omitted (backward compatible).</summary>
    public ProductKind Kind { get; set; } = ProductKind.Garment;

    /// <summary>Pricing behavior (Jira 9503). Defaults to GarmentPrint when omitted.</summary>
    public PricingModel PricingModel { get; set; } = PricingModel.GarmentPrint;

    /// <summary>Minimum sellable quantity (Jira 9503). Must be ≥ 1.</summary>
    [Range(1, 1000000)]
    public int MinimumQuantity { get; set; } = 1;

    /// <summary>When true, an order item for this product must carry a design asset (Jira 9503).</summary>
    public bool DesignUploadRequired { get; set; }
}
