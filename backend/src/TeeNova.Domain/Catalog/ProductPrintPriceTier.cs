using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// A quantity-break <b>print-only</b> price rule (Jira 9203). <see cref="UnitPrintPrice"/> is the
/// resolved price for printing one selected <see cref="PrintSizeId"/> on one garment at or above
/// <see cref="MinQuantity"/>. It does <b>not</b> include the garment/base price (that stays fixed)
/// and is never an all-in unit price; it replaces the retired all-in <c>ProductPriceTier</c> model.
///
/// Scope:
///   - Belongs to a <see cref="PrintPricingGroupId"/> (not a single product); the quantity break is
///     evaluated against the group's total quantity, so products in the same group combine.
///   - <see cref="Size"/> == null -> group default (applies to all garment sizes).
///   - <see cref="Size"/> != null -> override for that garment <c>ProductVariant.Size</c> string.
/// Resolution prefers size-override rows when present for the garment size, otherwise the group
/// default; within the chosen set the highest <see cref="MinQuantity"/> less than or equal to group quantity wins.
/// When no active tier exists for the selected PrintSize, callers fall back to PrintSize.BasePrice.
/// </summary>
public class ProductPrintPriceTier : Entity<Guid>
{
    public Guid PrintPricingGroupId { get; set; }

    /// <summary>Null = group default. Non-null = override for a specific garment size (ProductVariant.Size).</summary>
    public string? Size { get; set; }

    public Guid PrintSizeId { get; set; }

    /// <summary>Inclusive lower bound for this tier. Always at least 1. The highest tier is open-ended.</summary>
    public int MinQuantity { get; set; }

    /// <summary>Resolved print price (NZD) for one print at this break. Always &gt; 0, max 2 decimals.</summary>
    public decimal UnitPrintPrice { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected ProductPrintPriceTier() { }

    public ProductPrintPriceTier(
        Guid id,
        Guid printPricingGroupId,
        string? size,
        Guid printSizeId,
        int minQuantity,
        decimal unitPrintPrice,
        bool isActive = true,
        int sortOrder = 0)
        : base(id)
    {
        PrintPricingGroupId = printPricingGroupId;
        Size                = size;
        PrintSizeId         = printSizeId;
        MinQuantity         = minQuantity;
        UnitPrintPrice      = unitPrintPrice;
        IsActive            = isActive;
        SortOrder           = sortOrder;
    }
}
