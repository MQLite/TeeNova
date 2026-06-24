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

    /// <summary>
    /// The print price actually charged for this print (Jira 9203 print-only model): the resolved
    /// <c>ProductPrintPriceTier.UnitPrintPrice</c> for the effective group + garment size + group
    /// quantity, or <see cref="PrintSizePrice"/> (PrintSize.BasePrice) when no tier applied.
    /// PrintArea price is NOT included (PrintArea is placement metadata only under the new model).
    /// </summary>
    public decimal ResolvedUnitPrintPrice { get; set; }

    /// <summary>The applied print-tier MinQuantity for this print, or null when base-price fallback was used.</summary>
    public int? AppliedTierMinQuantity { get; set; }

    /// <summary>Next higher print-tier break for this print (for "add N more" hints), or null at the top.</summary>
    public int? NextTierMinQuantity { get; set; }
    public decimal? NextTierUnitPrintPrice { get; set; }

    /// <summary>
    /// The price charged for this print entry, equal to <see cref="ResolvedUnitPrintPrice"/> under the
    /// print-only model. Kept so the invariant UnitPrice == BasePrice + VariantAdjustment + Σ LinePrice holds.
    /// </summary>
    public decimal LinePrice { get; set; }
}
