using System;
using System.Collections.Generic;
using TeeNova.Catalog;

namespace TeeNova.Orders;

/// <summary>
/// How a product block's child rows are laid out (Jira 10104; columns finalised in Jira 10105).
/// </summary>
internal enum ProductionPdfRowLayout
{
    /// <summary>Colour · Size · Qty · Production details.</summary>
    GarmentVariant = 0,

    /// <summary>
    /// Qty · Design / production details — for Badge, Banner and any other non-garment kind, which
    /// carry no garment colour or size.
    /// </summary>
    CompactDesign = 1,
}

/// <summary>
/// One column of a product block's child table (Jira 10105). Produced by
/// <c>OrderProductionPdfService.ChildTableColumns</c>, which drives both the QuestPDF column definition
/// and the header row from this single list.
///
/// A column is either fixed (<see cref="ConstantWidth"/> &gt; 0) or flexible
/// (<see cref="RelativeWidth"/> is its weight). Every column carries data and a non-blank header —
/// the type cannot express a spacer or an unlabelled column.
/// </summary>
internal readonly record struct ProductionPdfChildColumn(
    string Header,
    float RelativeWidth,
    float ConstantWidth,
    bool AlignRight)
{
    public static ProductionPdfChildColumn Fixed(string header, float points, bool alignRight = false)
        => new(header, 0f, points, alignRight);

    public static ProductionPdfChildColumn Flexible(string header, float weight)
        => new(header, weight, 0f, AlignRight: false);
}

/// <summary>
/// Immutable, display-ready rendering model for the grouped production sheet (Jira 10104), built from
/// <see cref="OrderProductGroup"/> by <see cref="OrderProductionPdfModelBuilder"/>.
///
/// Pure, deterministic and fully unit-testable, so the layout can be asserted without inspecting
/// compressed PDF bytes. Deliberately <c>internal</c> to the Application assembly: it is not on
/// <c>OrderDto</c>, not returned by any controller, not persisted, and adds nothing to the public API.
/// Every field is already-formatted display text; no semantic key, signature, row key, source id,
/// storage path or internal Guid is ever rendered from it.
/// </summary>
internal sealed record ProductionPdfItemsModel(
    IReadOnlyList<ProductionPdfProductSection> Sections,
    int TotalQuantity)
{
    public int ProductCount => Sections.Count;
}

/// <summary>
/// One product block: the product identity and its total quantity shown once, then its child rows.
/// One section per <see cref="OrderProductGroup"/>, in the builder's order — never re-sorted here.
/// </summary>
internal sealed record ProductionPdfProductSection(
    string GroupKey,
    Guid ProductId,
    string ProductName,
    ProductKind ProductKind,
    string? KindLabel,
    int TotalQuantity,
    ProductionPdfRowLayout Layout,
    IReadOnlyList<ProductionPdfProductRow> Rows);

/// <summary>
/// One displayed child row — exactly one per projected <see cref="OrderProductGroupRow"/>.
/// <see cref="Quantity"/> is the builder's aggregated row quantity: it is never recounted, never derived
/// from <see cref="SourceOrderItemIds"/>, and print placements never multiply it.
/// <see cref="SourceOrderItemIds"/> is carried for traceability and tests only — it is never printed.
/// </summary>
internal sealed record ProductionPdfProductRow(
    string Colour,
    string Size,
    int Quantity,
    IReadOnlyList<string> ProductionLines,
    IReadOnlyList<Guid> SourceOrderItemIds)
{
    /// <summary>The production-detail cell text; QuestPDF renders the embedded line breaks.</summary>
    public string ProductionSummary => string.Join("\n", ProductionLines);
}
