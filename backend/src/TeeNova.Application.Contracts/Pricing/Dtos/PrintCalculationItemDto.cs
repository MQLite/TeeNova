using System;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Pricing.Dtos;

public class PrintCalculationItemDto
{
    [Required]
    public Guid PrintAreaId { get; set; }

    [Required]
    public Guid PrintSizeId { get; set; }
}
