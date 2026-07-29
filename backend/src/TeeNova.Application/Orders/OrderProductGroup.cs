using System;
using System.Collections.Generic;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Product-first read model of an order's contents (Jira 10103), built by
/// <see cref="OrderProductGroupBuilder"/> for the future grouped production sheet (Jira 10104/10106).
///
/// One group = one ACTUAL product: <c>(ProductId, ProductKind, PricingModel)</c>. The product NAME is
/// display-only and never part of the key, so two products that share a name never merge and one
/// product never splits because a historical snapshot spells its name differently.
///
/// Deliberately declared in the Application layer rather than Application.Contracts: it is an internal
/// rendering projection, is NOT exposed on <see cref="OrderDto"/> and adds nothing to the public API
/// surface. Every value is copied from the immutable order snapshot — no catalogue is consulted and no
/// price is ever recomputed.
/// </summary>
public sealed class OrderProductGroup
{
    /// <summary>Stable composite key: <c>{ProductId:N}|{ProductKind}|{PricingModel}</c>.</summary>
    public string GroupKey { get; init; } = string.Empty;

    public Guid ProductId { get; init; }
    public ProductKind ProductKind { get; init; }
    public PricingModel PricingModel { get; init; }

    /// <summary>
    /// Display name from the <c>OrderItem.ProductName</c> snapshot: the first non-blank value in
    /// deterministic source-item order, or the first value when every snapshot is blank. Never used
    /// for grouping.
    /// </summary>
    public string ProductName { get; init; } = string.Empty;

    /// <summary>Sum of this group's row quantities — always equal to the sum of its source items.</summary>
    public int TotalQuantity { get; init; }

    public IReadOnlyList<OrderProductGroupRow> Rows { get; init; } = Array.Empty<OrderProductGroupRow>();
}

/// <summary>
/// One production-distinct line inside an <see cref="OrderProductGroup"/>. Source order items are
/// aggregated into a single row ONLY when their complete production-significant key
/// (<see cref="RowKey"/>) is identical; every contributing item id is retained in
/// <see cref="SourceOrderItemIds"/> so a row is always traceable back to persisted data.
/// </summary>
public sealed class OrderProductGroupRow
{
    /// <summary>Full production-significant child key (see <see cref="OrderProductGroupBuilder"/>).</summary>
    public string RowKey { get; init; } = string.Empty;

    /// <summary>Garment variant id; null for non-garment items (Badge, Banner).</summary>
    public Guid? ProductVariantId { get; init; }

    /// <summary>Parsed from the <c>VariantLabel</c> snapshot; null when the item genuinely has none.</summary>
    public string? Colour { get; init; }

    /// <summary>Parsed from the <c>VariantLabel</c> snapshot; null when the item genuinely has none.</summary>
    public string? Size { get; init; }

    /// <summary>Raw <c>VariantLabel</c> snapshot of the first source item, kept verbatim for fallback display.</summary>
    public string? VariantLabel { get; init; }

    /// <summary>Sum of the source items' quantities (identical key ⇒ summing is safe).</summary>
    public int Quantity { get; init; }

    /// <summary>Immutable unit-price snapshot. Identical across all source items by construction; never averaged.</summary>
    public decimal UnitPrice { get; init; }

    /// <summary>Applied quantity-tier snapshot (Badge); null when not applicable. Never recomputed.</summary>
    public int? AppliedQuantityTierMinQuantity { get; init; }

    // ── Item-level design (Badge / Banner; null for garments, whose design lives per print) ──────
    public Guid? UploadedAssetId { get; init; }
    public string? UploadedAssetUrl { get; init; }
    public string? DesignNote { get; init; }

    /// <summary>Banner configuration snapshot reference (never mutated); null for non-Banner items.</summary>
    public BannerDetailDto? BannerDetail { get; init; }

    /// <summary>Print placements in deterministic signature order (the same order used to key the row).</summary>
    public IReadOnlyList<OrderProductGroupPrint> Prints { get; init; } = Array.Empty<OrderProductGroupPrint>();

    /// <summary>Every source <c>OrderItem.Id</c> folded into this row, ordered deterministically.</summary>
    public IReadOnlyList<Guid> SourceOrderItemIds { get; init; } = Array.Empty<Guid>();
}

/// <summary>
/// One print placement carried on an <see cref="OrderProductGroupRow"/>, copied verbatim from the
/// <c>OrderItemPrint</c> snapshot. <c>SortOrder</c> is deliberately absent: it is the original
/// selection index, not production-significant, and must never split or order rows.
/// </summary>
public sealed class OrderProductGroupPrint
{
    public Guid PrintAreaId { get; init; }
    public string PrintAreaName { get; init; } = string.Empty;
    public string PrintAreaCode { get; init; } = string.Empty;

    public Guid PrintSizeId { get; init; }
    public string PrintSizeName { get; init; } = string.Empty;
    public string PrintSizeCode { get; init; } = string.Empty;

    public Guid? UploadedAssetId { get; init; }
    public string? UploadedAssetUrl { get; init; }
    public string? DesignNote { get; init; }

    /// <summary>Admin/production note on the placement.</summary>
    public string? Notes { get; init; }

    /// <summary>Resolved print price snapshot (Jira 9203); 0 for pre-9203 rows. Never recomputed.</summary>
    public decimal ResolvedUnitPrintPrice { get; init; }

    /// <summary>Applied print-tier MinQuantity snapshot, or null (base-price/legacy fallback).</summary>
    public int? AppliedPrintTierMinQuantity { get; init; }
}
