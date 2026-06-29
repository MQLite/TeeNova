using System;
using System.Collections.Generic;

namespace TeeNova.Orders.Dtos;

/// <summary>
/// Additive, read-only grouped projection of an order's print content (Jira 9403 / Epic 9400).
/// Order contents are grouped by <b>design + print position (PrintArea) + print size (PrintSize)</b>.
/// Garment color and garment size are deliberately NOT part of the group key — they remain per-row
/// details (see <see cref="OrderPrintGroupRowDto"/>).
///
/// This model is computed on the backend from the already-loaded flat <c>OrderDto.Items</c> snapshot
/// (no extra DB queries) and exists alongside the unchanged flat items for backward compatibility.
/// It is purely for display: it never recomputes pricing and must not be used to derive order totals.
/// </summary>
public class OrderPrintGroupDto
{
    /// <summary>Stable composite key: <c>{DesignKey}|{PrintAreaId:N}|{PrintSizeId:N}</c>.</summary>
    public string GroupKey { get; set; } = default!;

    /// <summary>Human-readable design name derived from the print's uploaded asset URL, or a fallback label.</summary>
    public string DesignName { get; set; } = default!;

    /// <summary>Normalized design identity used inside <see cref="GroupKey"/> (lower-cased, or "(no-design)").</summary>
    public string DesignKey { get; set; } = default!;

    public Guid PrintAreaId { get; set; }
    public string PrintAreaName { get; set; } = default!;
    public string? PrintAreaCode { get; set; }

    public Guid PrintSizeId { get; set; }
    public string PrintSizeName { get; set; } = default!;
    public string? PrintSizeCode { get; set; }

    /// <summary>Sum of member rows' garment quantities (each garment counted once per group it belongs to).</summary>
    public int TotalQuantity { get; set; }

    public List<OrderPrintGroupRowDto> Rows { get; set; } = new();
}

/// <summary>
/// One garment+print member of an <see cref="OrderPrintGroupDto"/>. <see cref="UnitPrice"/> and
/// <see cref="LineTotal"/> are whole-<c>OrderItem</c> snapshot values (NOT per-print): an item with
/// multiple prints appears in multiple groups, so summing these across groups double-counts. The
/// authoritative order total is always <c>Order.TotalAmount</c>.
/// </summary>
public class OrderPrintGroupRowDto
{
    public Guid OrderItemId { get; set; }
    public Guid OrderItemPrintId { get; set; }

    public string ProductName { get; set; } = default!;

    /// <summary>Raw "Color / Size" snapshot, kept verbatim for fallback display.</summary>
    public string VariantLabel { get; set; } = default!;

    /// <summary>Parsed from <see cref="VariantLabel"/> — display only, never part of the group key.</summary>
    public string? Color { get; set; }

    /// <summary>Parsed from <see cref="VariantLabel"/> — display only, never part of the group key.</summary>
    public string? GarmentSize { get; set; }

    public int Quantity { get; set; }

    /// <summary>Whole-item unit price snapshot (authoritative; not recomputed).</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Whole-item line total snapshot (<c>UnitPrice × Quantity</c>); do not sum across groups.</summary>
    public decimal LineTotal { get; set; }

    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote { get; set; }
    public string? PrintNotes { get; set; }

    /// <summary>Resolved print price snapshot (Jira 9203). 0 for pre-9203 rows.</summary>
    public decimal ResolvedUnitPrintPrice { get; set; }

    /// <summary>Applied print-tier MinQuantity snapshot, or null (base-price/legacy fallback).</summary>
    public int? AppliedPrintTierMinQuantity { get; set; }

    /// <summary>
    /// True when this print row predates the 9203 print-only tier model
    /// (<see cref="ResolvedUnitPrintPrice"/> == 0 and <see cref="AppliedPrintTierMinQuantity"/> == null).
    /// Display-only hint; the row still shows the authoritative <see cref="UnitPrice"/> snapshot.
    /// </summary>
    public bool IsLegacyPricingSnapshot { get; set; }
}
