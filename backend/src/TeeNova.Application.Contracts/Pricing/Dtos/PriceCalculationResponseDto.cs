using System.Collections.Generic;

namespace TeeNova.Pricing.Dtos;

public class PriceCalculationResponseDto
{
    public decimal ProductBasePrice { get; set; }
    public decimal VariantAdjustment { get; set; }
    public List<PrintAddOnPriceDto> PrintAddOns { get; set; } = new();

    // ── Print-only pricing (Jira 9203) ───────────────────────────────────────────

    /// <summary>Fixed garment unit price = ProductBasePrice + VariantAdjustment. Never discounted by tiers.</summary>
    public decimal GarmentUnitPrice { get; set; }

    /// <summary>Sum of resolved print prices across all selected prints (0 when no prints selected).</summary>
    public decimal PrintUnitPrice { get; set; }

    /// <summary>ProductBasePrice + VariantAdjustment + sum(PrintAddOns.LinePrice). = GarmentUnitPrice + PrintUnitPrice.</summary>
    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    /// <summary>UnitPrice * Quantity</summary>
    public decimal LineTotal { get; set; }

    public string Currency { get; set; } = "NZD";

    // ── Pricing mode ─────────────────────────────────────────────────────────────

    /// <summary>"Additive" (no print tier applied — base-price prints) or "Tiered" (≥1 print tier applied).</summary>
    public string PricingMode { get; set; } = "Additive";

    /// <summary>
    /// Backward-compat (Jira 9203): the applied print-tier MinQuantity of the first tiered print, or
    /// null when no print tier applied. Per-print detail lives on <see cref="PrintAddOns"/>.
    /// </summary>
    public int? AppliedTierMinQuantity { get; set; }

    /// <summary>Backward-compat: the resolved print price of the first tiered print. Null when no tier applied.</summary>
    public decimal? AppliedTierUnitPrice { get; set; }

    /// <summary>Backward-compat: next higher break of the first tiered print, for "add N more" hints.</summary>
    public int? NextTierMinQuantity { get; set; }
    public decimal? NextTierUnitPrice { get; set; }

    /// <summary>
    /// DEPRECATED (Jira 9203): always 0 under the print-only model. There is no "included standard
    /// print" anymore. Retained only so existing frontend code keeps compiling until 9207 cleanup.
    /// </summary>
    public decimal IncludedStandardPrintAmount { get; set; }
}
