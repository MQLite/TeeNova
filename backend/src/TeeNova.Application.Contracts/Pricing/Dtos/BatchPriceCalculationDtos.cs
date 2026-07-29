using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Pricing.Dtos;

/// <summary>
/// One quote in a read-only cart pricing batch. CorrelationKey is opaque client data used only to
/// correlate the response; it is never used to select a product, variant, option, tier, or price.
/// </summary>
public class BatchPriceCalculationItemDto
{
    [Required]
    [StringLength(64, MinimumLength = 1)]
    public string CorrelationKey { get; set; } = string.Empty;

    [Required]
    public PriceCalculationRequestDto Request { get; set; } = new();
}

public class BatchPriceCalculationRequestDto
{
    [Required]
    [MinLength(1)]
    [MaxLength(50)]
    public List<BatchPriceCalculationItemDto> Items { get; set; } = new();
}

public class BatchPriceCalculationResultDto
{
    public string CorrelationKey { get; set; } = string.Empty;
    public PriceCalculationResponseDto? Quote { get; set; }
    public string? ErrorCode { get; set; }
}

public class BatchPriceCalculationResponseDto
{
    public List<BatchPriceCalculationResultDto> Results { get; set; } = new();
}
