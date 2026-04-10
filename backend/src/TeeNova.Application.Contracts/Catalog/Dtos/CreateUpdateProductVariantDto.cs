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

    [Range(0, int.MaxValue)]
    public int StockQuantity { get; set; } = 0;

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

    [Range(0, int.MaxValue)]
    public int StockQuantity { get; set; }

    public bool IsAvailable { get; set; }
}

public class UpdateStockDto
{
    [Range(0, int.MaxValue)]
    public int StockQuantity { get; set; }
}
