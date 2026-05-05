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
    /// Formula:
    ///   UnitPrice  = productBasePrice + variantAdjustment + Σ(areaPrice + sizePrice)
    ///   LineTotal  = UnitPrice × quantity
    /// </summary>
    public static PriceCalculationResponseDto Calculate(
        decimal productBasePrice,
        decimal variantAdjustment,
        IReadOnlyList<PrintPricingEntry> prints,
        int quantity)
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

        var unitPrice = productBasePrice + variantAdjustment + addOns.Sum(a => a.LinePrice);

        return new PriceCalculationResponseDto
        {
            ProductBasePrice  = productBasePrice,
            VariantAdjustment = variantAdjustment,
            PrintAddOns       = addOns,
            UnitPrice         = unitPrice,
            Quantity          = quantity,
            LineTotal         = unitPrice * quantity,
            Currency          = "NZD",
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
