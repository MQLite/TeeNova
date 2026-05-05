using System;

namespace TeeNova.Pricing.Dtos;

public class PrintAddOnPriceDto
{
    public Guid PrintAreaId { get; set; }
    public string PrintAreaName { get; set; } = default!;
    public decimal PrintAreaPrice { get; set; }

    public Guid PrintSizeId { get; set; }
    public string PrintSizeName { get; set; } = default!;
    public decimal PrintSizePrice { get; set; }

    /// <summary>PrintAreaPrice + PrintSizePrice for this print entry.</summary>
    public decimal LinePrice { get; set; }
}
