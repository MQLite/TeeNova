using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// A product/size scoped <b>allowed print option</b> (Jira 9204): which (PrintArea, PrintSize)
/// combination a product — optionally a specific garment size — permits a customer to select.
/// This governs <i>selectability only</i>; it has no effect on price (print price comes from
/// <see cref="ProductPrintPriceTier"/> / PrintSize.BasePrice and is entirely separate).
///
/// Scope:
///   • <see cref="ProductId"/> + <see cref="Size"/> == null → product-level default allowed options.
///   • <see cref="ProductId"/> + <see cref="Size"/> != null → override for that garment
///     <c>ProductVariant.Size</c> string.
/// Resolution prefers active size-override rows when present for the garment size, otherwise the
/// product default rows; when neither exists the product falls back to the global
/// <c>PrintAreaSizeOption</c> matrix. Scoped rows only <b>narrow</b> choices — a selection must
/// still be valid in the active global matrix (enforced by the existing PrintConfigValidator).
/// </summary>
public class ProductPrintConfigOption : Entity<Guid>
{
    public Guid ProductId { get; set; }

    /// <summary>Null = product default. Non-null = override for a specific garment size (ProductVariant.Size).</summary>
    public string? Size { get; set; }

    public Guid PrintAreaId { get; set; }
    public Guid PrintSizeId { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected ProductPrintConfigOption() { }

    public ProductPrintConfigOption(
        Guid id,
        Guid productId,
        string? size,
        Guid printAreaId,
        Guid printSizeId,
        bool isActive = true,
        int sortOrder = 0)
        : base(id)
    {
        ProductId   = productId;
        Size        = size;
        PrintAreaId = printAreaId;
        PrintSizeId = printSizeId;
        IsActive    = isActive;
        SortOrder   = sortOrder;
    }
}
