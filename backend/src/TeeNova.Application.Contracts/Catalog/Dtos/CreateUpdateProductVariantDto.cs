using System.ComponentModel.DataAnnotations;

namespace TeeNova.Catalog.Dtos;

public class CreateProductVariantDto
{
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
    /// Deprecated for write (Jira 9002): inventory is now managed exclusively via
    /// PUT .../variants/{id}/inventory. Retained (nullable) for payload backward-compatibility;
    /// ignored on create. New variants default to <see cref="VariantInventoryStatus.NotRecorded"/> / null stock.
    /// </summary>
    [Range(0, int.MaxValue)]
    public int? StockQuantity { get; set; }

    public bool IsAvailable { get; set; } = true;
}

public class UpdateProductVariantDto
{
    [Required]
    [MaxLength(64)]
    public string Sku { get; set; } = default!;

    [Required]
    [MaxLength(64)]
    public string Color { get; set; } = default!;

    [Required]
    [MaxLength(32)]
    public string Size { get; set; } = default!;

    public decimal PriceAdjustment { get; set; }

    /// <summary>
    /// Deprecated for write (Jira 9002): inventory is managed via the inventory endpoint and is
    /// preserved untouched by this flow. Retained (nullable) for payload backward-compatibility; ignored on update.
    /// </summary>
    [Range(0, int.MaxValue)]
    public int? StockQuantity { get; set; }

    public bool IsAvailable { get; set; }
}
