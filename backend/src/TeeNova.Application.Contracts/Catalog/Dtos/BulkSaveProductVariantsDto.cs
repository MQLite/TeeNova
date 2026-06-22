using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Catalog.Dtos;

public class UpsertProductVariantItemDto
{
    /// <summary>When set, identifies an existing variant to update. When null, a new variant is created.</summary>
    public Guid? Id { get; set; }

    [Required]
    [MaxLength(64)]
    public string Sku { get; set; } = default!;

    [Required]
    [MaxLength(64)]
    public string Color { get; set; } = default!;

    [Required]
    [MaxLength(32)]
    public string Size { get; set; } = default!;

    public decimal PriceAdjustment { get; set; } = 0;

    /// <summary>
    /// Deprecated for write (Jira 9002): inventory is managed via the inventory endpoint.
    /// Existing variants keep their inventory untouched on bulk save; new variants default to
    /// NotRecorded / null stock. Retained (nullable) for payload backward-compatibility; ignored.
    /// </summary>
    [Range(0, int.MaxValue)]
    public int? StockQuantity { get; set; }

    public bool IsAvailable { get; set; } = true;
}

public class BulkSaveProductVariantsDto
{
    [Required]
    public List<UpsertProductVariantItemDto> Variants { get; set; } = new();
}
