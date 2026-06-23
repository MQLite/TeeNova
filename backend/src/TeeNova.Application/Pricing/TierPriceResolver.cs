using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;

namespace TeeNova.Pricing;

/// <summary>
/// Stateless quantity-break tier resolution (Jira 9102). Shared by the quote path
/// (<see cref="PricingAppService"/>) and the authoritative order path
/// (<c>OrderAppService.CreateAsync</c>) so display quotes and saved order prices cannot drift.
///
/// Resolution (Option C):
///   1. If the variant has any override tiers (ProductVariantId == variantId), use that set.
///   2. Otherwise use the product-level set (ProductVariantId == null).
///   3. Within the chosen set, pick the highest MinQuantity ≤ quantity.
///
/// Tier sets are validated to contain a MinQuantity == 1 row, so a match always exists for
/// quantity ≥ 1. The defensive "lowest tier" fallback below covers any legacy/manual data that
/// somehow lacks a MinQuantity == 1 row, keeping resolution total.
/// </summary>
internal static class TierPriceResolver
{
    public static ResolvedPriceTier? Resolve(
        IEnumerable<ProductPriceTier>? productTiers,
        Guid variantId,
        int quantity)
    {
        if (productTiers == null)
            return null;

        var tiers = productTiers as IReadOnlyList<ProductPriceTier> ?? productTiers.ToList();
        if (tiers.Count == 0)
            return null;

        var scoped = tiers.Where(t => t.ProductVariantId == variantId).ToList();
        if (scoped.Count == 0)
            scoped = tiers.Where(t => t.ProductVariantId == null).ToList();
        if (scoped.Count == 0)
            return null;

        var ordered = scoped.OrderBy(t => t.MinQuantity).ToList();

        // Highest break at or below the quantity; fall back to the lowest tier if quantity is
        // below the first break (only possible with non-conforming data — see class remarks).
        var applicable = ordered.LastOrDefault(t => t.MinQuantity <= quantity) ?? ordered[0];
        var next       = ordered.FirstOrDefault(t => t.MinQuantity > applicable.MinQuantity);

        return new ResolvedPriceTier(
            applicable.MinQuantity,
            applicable.UnitPrice,
            next?.MinQuantity,
            next?.UnitPrice);
    }
}

/// <summary>The tier selected for a (variant, quantity), plus the next break for UI hints.</summary>
internal sealed record ResolvedPriceTier(
    int MinQuantity,
    decimal UnitPrice,
    int? NextMinQuantity,
    decimal? NextUnitPrice);
