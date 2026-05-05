using System;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.PrintConfig.Dtos;

public class SetPrintAreaSizeOptionInput
{
    [Required]
    public Guid PrintSizeId { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
