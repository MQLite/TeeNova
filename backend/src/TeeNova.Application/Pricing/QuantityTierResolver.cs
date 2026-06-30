using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;

namespace TeeNova.Pricing;

/// <summary>
/// Stateless quantity-break <b>unit</b> price resolution for the Badge
/// <see cref="PricingModel.QuantityTierUnit"/> model (Jira 9503). Shared by the quote path
/// (<see cref="PricingAppService"/>) and the authoritative order path (the Badge pricing strategy) so
/// display quotes and saved order prices cannot drift.
///
/// Among active tiers, the highest <see cref="ProductQuantityPriceTier.MinQuantity"/> ≤ quantity wins.
/// Badge orders are gated by <c>Product.MinimumQuantity</c>, so a below-lowest-break quantity should not
/// normally reach here; the resolver still falls back defensively to the lowest break to stay total.
/// </summary>
internal static class QuantityTierResolver
{
    /// <summary>Resolves the unit price for <paramref name="quantity"/>, or null when no active tier exists.</summary>
    public static ResolvedQuantityTier? Resolve(IEnumerable<ProductQuantityPriceTier>? tiers, int quantity)
    {
        var ordered = tiers?
            .Where(t => t.IsActive)
            .OrderBy(t => t.MinQuantity)
            .ToList();

        if (ordered == null || ordered.Count == 0)
            return null;

        var applicable = ordered.LastOrDefault(t => t.MinQuantity <= quantity) ?? ordered[0];
        var next       = ordered.FirstOrDefault(t => t.MinQuantity > applicable.MinQuantity);

        return new ResolvedQuantityTier(
            applicable.UnitPrice,
            applicable.MinQuantity,
            next?.MinQuantity,
            next?.UnitPrice);
    }
}

/// <summary>The resolved Badge unit price plus the applied/next break for UI hints (Jira 9503).</summary>
internal sealed record ResolvedQuantityTier(
    decimal UnitPrice,
    int AppliedMinQuantity,
    int? NextMinQuantity,
    decimal? NextUnitPrice);
