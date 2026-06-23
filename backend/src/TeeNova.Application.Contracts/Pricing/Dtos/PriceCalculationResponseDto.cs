using System.Collections.Generic;

namespace TeeNova.Pricing.Dtos;

public class PriceCalculationResponseDto
{
    public decimal ProductBasePrice { get; set; }
    public decimal VariantAdjustment { get; set; }
    public List<PrintAddOnPriceDto> PrintAddOns { get; set; } = new();

    /// <summary>ProductBasePrice + VariantAdjustment + sum(PrintAddOns.LinePrice). Invariant holds in both modes.</summary>
    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    /// <summary>UnitPrice * Quantity</summary>
    public decimal LineTotal { get; set; }

    public string Currency { get; set; } = "NZD";

    // ── Tiered pricing (Jira 9102) ──────────────────────────────────────────────

    /// <summary>"Additive" (legacy formula) or "Tiered" (a quantity-break tier was applied).</summary>
    public string PricingMode { get; set; } = "Additive";

    /// <summary>
    /// In Tiered mode: the resolved tier's MinQuantity and UnitPrice (garment + one standard
    /// one-side print). Null in Additive mode. In Tiered mode <see cref="ProductBasePrice"/>
    /// equals <see cref="AppliedTierUnitPrice"/> and <see cref="VariantAdjustment"/> is 0 (folded in).
    /// </summary>
    public int? AppliedTierMinQuantity { get; set; }
    public decimal? AppliedTierUnitPrice { get; set; }

    /// <summary>The next higher tier break, if any — for "add N more to reach $X ea" hints. Null otherwise.</summary>
    public int? NextTierMinQuantity { get; set; }
    public decimal? NextTierUnitPrice { get; set; }

    /// <summary>
    /// In Tiered mode: the add-on amount of the single print bundled into the tier price (the
    /// included standard one-side print), excluded from <see cref="PrintAddOns"/> to avoid
    /// double-charging. 0 when no prints were selected or in Additive mode.
    /// </summary>
    public decimal IncludedStandardPrintAmount { get; set; }
}
