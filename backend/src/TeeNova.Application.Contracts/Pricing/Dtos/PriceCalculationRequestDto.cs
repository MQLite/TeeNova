using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Pricing.Dtos;

public class PriceCalculationRequestDto
{
    [Required]
    public Guid ProductId { get; set; }

    [Required]
    public Guid VariantId { get; set; }

    [Range(1, 100)]
    public int Quantity { get; set; } = 1;

    public List<PrintCalculationItemDto> Prints { get; set; } = new();
}
