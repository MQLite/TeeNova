using System.ComponentModel.DataAnnotations;

namespace TeeNova.PrintConfig.Dtos;

public class CreateUpdatePrintAreaDto
{
    [Required]
    [MaxLength(128)]
    public string Name { get; set; } = default!;

    [Required]
    [MaxLength(64)]
    public string Code { get; set; } = default!;

    [Range(0, 999999)]
    public decimal BasePrice { get; set; }

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }

    public int? LegacyPositionValue { get; set; }
}
