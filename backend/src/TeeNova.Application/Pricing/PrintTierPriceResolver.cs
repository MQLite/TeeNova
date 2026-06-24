using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;

namespace TeeNova.Pricing;

/// <summary>
/// Stateless print-only quantity-break resolution (Jira 9203). Shared by the quote path
/// (<see cref="PricingAppService"/>) and the authoritative order path (<c>OrderAppService.CreateAsync</c>)
/// so display quotes and saved order prices cannot drift.
///
/// For one selected print, given the effective <see cref="PrintPricingGroup"/>'s tiers, the garment
/// size, the selected PrintSize, and the <b>group total quantity</b>:
///   1. Keep only active rows for that PrintSize.
///   2. Size override wins: if any rows have Size == garmentSize, use that subset; else the
///      group-default subset (Size == null).
///   3. Within the chosen subset pick the highest MinQuantity ≤ group quantity (defensive fallback
///      to the lowest break if data lacks a MinQuantity == 1 row, keeping resolution total).
///   4. If no usable tier exists for that PrintSize, fall back to <c>PrintSize.BasePrice</c>.
///
/// The group only governs the break <i>threshold</i>; the PrintSize selects which ladder is used.
/// </summary>
internal static class PrintTierPriceResolver
{
    public static ResolvedPrintTier Resolve(
        IEnumerable<ProductPrintPriceTier>? groupTiers,
        string? garmentSize,
        Guid printSizeId,
        int groupQuantity,
        decimal printSizeBasePrice)
    {
        var candidates = groupTiers?
            .Where(t => t.IsActive && t.PrintSizeId == printSizeId)
            .ToList();

        if (candidates == null || candidates.Count == 0)
            return ResolvedPrintTier.Fallback(printSizeBasePrice);

        // Size override wins when present for this garment size; otherwise the group default.
        var scoped = !string.IsNullOrEmpty(garmentSize)
            ? candidates.Where(t => string.Equals(t.Size, garmentSize, StringComparison.Ordinal)).ToList()
            : new List<ProductPrintPriceTier>();

        if (scoped.Count == 0)
            scoped = candidates.Where(t => t.Size == null).ToList();

        if (scoped.Count == 0)
            return ResolvedPrintTier.Fallback(printSizeBasePrice);

        var ordered = scoped.OrderBy(t => t.MinQuantity).ToList();

        // Highest break at or below the group quantity; fall back to the lowest break if the
        // quantity is below the first break (only possible with non-conforming data).
        var applicable = ordered.LastOrDefault(t => t.MinQuantity <= groupQuantity) ?? ordered[0];
        var next       = ordered.FirstOrDefault(t => t.MinQuantity > applicable.MinQuantity);

        return new ResolvedPrintTier(
            applicable.UnitPrintPrice,
            applicable.MinQuantity,
            next?.MinQuantity,
            next?.UnitPrintPrice,
            TierApplied: true);
    }
}

/// <summary>
/// The resolved print price for one selected print, plus the applied/next break for UI hints.
/// <see cref="TierApplied"/> is false when no tier matched and PrintSize.BasePrice was used.
/// </summary>
internal sealed record ResolvedPrintTier(
    decimal UnitPrintPrice,
    int? AppliedMinQuantity,
    int? NextMinQuantity,
    decimal? NextUnitPrintPrice,
    bool TierApplied)
{
    public static ResolvedPrintTier Fallback(decimal basePrice)
        => new(basePrice, null, null, null, TierApplied: false);
}
