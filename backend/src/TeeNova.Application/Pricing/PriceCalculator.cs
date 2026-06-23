using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Pricing.Dtos;

namespace TeeNova.Pricing;

/// <summary>
/// Stateless pricing formula. Accepts already-loaded entity values so callers
/// control DB access and avoid duplicate round-trips.
/// </summary>
internal static class PriceCalculator
{
    /// <summary>
    /// Computes a full price breakdown.
    ///
    /// Additive mode (no tier resolved — unchanged legacy formula):
    ///   UnitPrice  = productBasePrice + variantAdjustment + Σ(areaPrice + sizePrice)
    ///
    /// Tiered mode (Jira 9102 — a quantity-break tier resolved):
    ///   The tier UnitPrice is the final standard printed unit price (garment + one standard
    ///   one-side print). The single highest-priced selected print is treated as that included
    ///   standard print (so it is not double-charged); every other selected print stays additive.
    ///   The product base price and variant adjustment are folded into the tier price.
    ///     UnitPrice = tier.UnitPrice + Σ(extra print add-ons)
    ///
    /// In both modes: LineTotal = UnitPrice × quantity, and the invariant
    /// UnitPrice == ProductBasePrice + VariantAdjustment + Σ(PrintAddOns.LinePrice) holds.
    /// </summary>
    public static PriceCalculationResponseDto Calculate(
        decimal productBasePrice,
        decimal variantAdjustment,
        IReadOnlyList<PrintPricingEntry> prints,
        int quantity,
        ResolvedPriceTier? tier = null)
    {
        var addOns = prints.Select(p => new PrintAddOnPriceDto
        {
            PrintAreaId    = p.AreaId,
            PrintAreaName  = p.AreaName,
            PrintAreaPrice = p.AreaPrice,
            PrintSizeId    = p.SizeId,
            PrintSizeName  = p.SizeName,
            PrintSizePrice = p.SizePrice,
            LinePrice      = p.AreaPrice + p.SizePrice,
        }).ToList();

        if (tier == null)
        {
            var additiveUnit = productBasePrice + variantAdjustment + addOns.Sum(a => a.LinePrice);

            return new PriceCalculationResponseDto
            {
                ProductBasePrice  = productBasePrice,
                VariantAdjustment = variantAdjustment,
                PrintAddOns       = addOns,
                UnitPrice         = additiveUnit,
                Quantity          = quantity,
                LineTotal         = additiveUnit * quantity,
                Currency          = "NZD",
                PricingMode       = "Additive",
            };
        }

        // ── Tiered ──────────────────────────────────────────────────────────────
        // Bundle the single most expensive selected print into the tier price as the included
        // standard one-side print. All remaining prints are charged additively.
        decimal includedStandard = addOns.Count > 0 ? addOns.Max(a => a.LinePrice) : 0m;

        var extras = new List<PrintAddOnPriceDto>(addOns);
        if (extras.Count > 0)
        {
            var includedIndex = extras.FindIndex(a => a.LinePrice == includedStandard);
            if (includedIndex >= 0)
                extras.RemoveAt(includedIndex);
        }

        var tieredUnit = tier.UnitPrice + extras.Sum(a => a.LinePrice);

        return new PriceCalculationResponseDto
        {
            ProductBasePrice            = tier.UnitPrice, // all-in standard unit price
            VariantAdjustment           = 0m,             // folded into the tier price
            PrintAddOns                 = extras,         // only the additional prints
            UnitPrice                   = tieredUnit,
            Quantity                    = quantity,
            LineTotal                   = tieredUnit * quantity,
            Currency                    = "NZD",
            PricingMode                 = "Tiered",
            AppliedTierMinQuantity      = tier.MinQuantity,
            AppliedTierUnitPrice        = tier.UnitPrice,
            NextTierMinQuantity         = tier.NextMinQuantity,
            NextTierUnitPrice           = tier.NextUnitPrice,
            IncludedStandardPrintAmount = includedStandard,
        };
    }
}

/// <summary>
/// Carries the pricing-relevant fields from a loaded PrintArea + PrintSize pair.
/// Used internally to avoid passing full domain entities across service boundaries.
/// </summary>
internal record PrintPricingEntry(
    Guid   AreaId,
    string AreaName,
    decimal AreaPrice,
    Guid   SizeId,
    string SizeName,
    decimal SizePrice);
