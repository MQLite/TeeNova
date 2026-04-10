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
    [Range(0.01, 999999)]
    public decimal BasePrice { get; set; }

    [Required]
    [MaxLength(64)]
    public string ProductType { get; set; } = default!;

    public bool IsActive { get; set; } = true;
}

public class UpdateProductDto
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = default!;

    [MaxLength(4000)]
    public string? Description { get; set; }

    [Required]
    [Range(0.01, 999999)]
    public decimal BasePrice { get; set; }

    [Required]
    [MaxLength(64)]
    public string ProductType { get; set; } = default!;

    public bool IsActive { get; set; }
}
