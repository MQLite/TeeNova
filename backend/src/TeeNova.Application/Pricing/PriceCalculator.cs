using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Pricing.Dtos;

namespace TeeNova.Pricing;

/// <summary>
/// Stateless print-only pricing formula (Jira 9203). Accepts already-resolved print prices so callers
/// control DB access and the quote and order paths share one calculation.
///
///   garmentUnitPrice = productBasePrice + variantAdjustment      (fixed — never discounted)
///   printUnitPrice   = Σ resolved print prices                   (per-print tier or PrintSize.BasePrice)
///   unitPrice        = garmentUnitPrice + printUnitPrice
///   lineTotal        = unitPrice × quantity
///
/// PrintArea.BasePrice is NOT part of the price under the new model (PrintArea is placement metadata).
/// There is no "included standard print", no all-in tier, and no max(add-on) heuristic.
/// Invariant: UnitPrice == ProductBasePrice + VariantAdjustment + Σ(PrintAddOns.LinePrice).
/// </summary>
internal static class PriceCalculator
{
    public static PriceCalculationResponseDto Calculate(
        decimal productBasePrice,
        decimal variantAdjustment,
        IReadOnlyList<ResolvedPrintAddOn> prints,
        int quantity)
    {
        var addOns = prints.Select(p => new PrintAddOnPriceDto
        {
            PrintAreaId            = p.Entry.AreaId,
            PrintAreaName          = p.Entry.AreaName,
            PrintAreaPrice         = p.Entry.AreaPrice,   // informational only — not charged
            PrintSizeId            = p.Entry.SizeId,
            PrintSizeName          = p.Entry.SizeName,
            PrintSizePrice         = p.Entry.SizePrice,   // PrintSize.BasePrice (informational)
            ResolvedUnitPrintPrice = p.Resolved.UnitPrintPrice,
            AppliedTierMinQuantity = p.Resolved.AppliedMinQuantity,
            NextTierMinQuantity    = p.Resolved.NextMinQuantity,
            NextTierUnitPrintPrice = p.Resolved.NextUnitPrintPrice,
            LinePrice              = p.Resolved.UnitPrintPrice,
        }).ToList();

        var garmentUnit = productBasePrice + variantAdjustment;
        var printUnit   = addOns.Sum(a => a.LinePrice);
        var unit        = garmentUnit + printUnit;

        var firstTiered = prints.FirstOrDefault(p => p.Resolved.TierApplied);

        return new PriceCalculationResponseDto
        {
            ProductBasePrice            = productBasePrice,
            VariantAdjustment           = variantAdjustment,
            PrintAddOns                 = addOns,
            GarmentUnitPrice            = garmentUnit,
            PrintUnitPrice              = printUnit,
            UnitPrice                   = unit,
            Quantity                    = quantity,
            LineTotal                   = unit * quantity,
            Currency                    = "NZD",
            PricingMode                 = firstTiered != null ? "Tiered" : "Additive",
            AppliedTierMinQuantity      = firstTiered?.Resolved.AppliedMinQuantity,
            AppliedTierUnitPrice        = firstTiered?.Resolved.UnitPrintPrice,
            NextTierMinQuantity         = firstTiered?.Resolved.NextMinQuantity,
            NextTierUnitPrice           = firstTiered?.Resolved.NextUnitPrintPrice,
            IncludedStandardPrintAmount = 0m, // retired; always 0 under the print-only model
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

/// <summary>A selected print paired with its resolved print-tier price (Jira 9203).</summary>
internal sealed record ResolvedPrintAddOn(PrintPricingEntry Entry, ResolvedPrintTier Resolved);
