using System.Collections.Generic;

namespace TeeNova.Pricing.Dtos;

public class PriceCalculationResponseDto
{
    public decimal ProductBasePrice { get; set; }
    public decimal VariantAdjustment { get; set; }
    public List<PrintAddOnPriceDto> PrintAddOns { get; set; } = new();

    /// <summary>ProductBasePrice + VariantAdjustment + sum(PrintAddOns.LinePrice)</summary>
    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    /// <summary>UnitPrice * Quantity</summary>
    public decimal LineTotal { get; set; }

    public string Currency { get; set; } = "NZD";
}
