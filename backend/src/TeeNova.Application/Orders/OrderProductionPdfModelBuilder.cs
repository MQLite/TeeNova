using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Turns the Jira 10103 product-first projection into the display-ready
/// <see cref="ProductionPdfItemsModel"/> the production sheet renders (Jira 10104).
///
/// This is the single integration point: <see cref="Build(OrderDto)"/> calls
/// <see cref="OrderProductGroupBuilder.Build"/> on the already-loaded order snapshot. There is no second
/// order query, no catalogue query, no DI, no pricing and no mutation — only formatting.
///
/// Invariants preserved by construction:
/// <list type="bullet">
///   <item>one section per <see cref="OrderProductGroup"/>, in the builder's order (never re-sorted);</item>
///   <item>one displayed row per <see cref="OrderProductGroupRow"/>, in the builder's order
///         (never regrouped, never dropped for missing colour/size/design/print data);</item>
///   <item><c>Quantity</c> copied from the builder — never recounted from source ids or print rows.</item>
/// </list>
/// </summary>
internal static class OrderProductionPdfModelBuilder
{
    /// <summary>Field separator for the internal duplicate-display detection key (ASCII Unit Separator).</summary>
    private const char DisplayKeyFieldSeparator = (char)0x1F;

    /// <summary>Line separator for the internal duplicate-display detection key (ASCII Record Separator).</summary>
    private const char DisplayKeyLineSeparator = (char)0x1E;

    /// <summary>The 10104 integration point: snapshot → product-first projection → rendering model.</summary>
    public static ProductionPdfItemsModel Build(OrderDto order)
        => FromGroups(OrderProductGroupBuilder.Build(order));

    public static ProductionPdfItemsModel FromGroups(IReadOnlyList<OrderProductGroup> groups)
    {
        var sections = new List<ProductionPdfProductSection>(groups.Count);

        foreach (var group in groups)
        {
            // Garment blocks get the Colour/Size columns; every other kind gets the compact layout,
            // because forcing meaningless garment cells onto a Badge or Banner helps nobody.
            var layout = group.ProductKind == ProductKind.Garment
                ? ProductionPdfRowLayout.GarmentVariant
                : ProductionPdfRowLayout.CompactDesign;

            var rows = group.Rows
                .Select(row => new ProductionPdfProductRow(
                    OrderProductGroupRowFormatter.Colour(row),
                    OrderProductGroupRowFormatter.Size(row),
                    row.Quantity,
                    OrderProductGroupRowFormatter.ProductionLines(row, group.ProductKind),
                    row.SourceOrderItemIds))
                .ToList();

            Disambiguate(rows, group.Rows);

            sections.Add(new ProductionPdfProductSection(
                group.GroupKey,
                group.ProductId,
                OrderProductGroupRowFormatter.ProductName(group.ProductName),
                group.ProductKind,
                OrderProductGroupRowFormatter.KindLabel(group.ProductKind),
                group.TotalQuantity,
                layout,
                rows));
        }

        return new ProductionPdfItemsModel(sections, sections.Sum(s => s.TotalQuantity));
    }

    /// <summary>
    /// The builder keeps two rows separate whenever ANY production-significant field differs — including
    /// unit price and variant id, which the sheet has no column for. Without this pass such rows could
    /// render as two visually identical lines, which reads exactly like an accidental duplicate.
    ///
    /// So: any set of rows that would render identically gets the field that actually separates them
    /// appended — the unit price when prices differ, otherwise a plain ordinal marker. Rows that already
    /// read differently are left completely alone, so the normal sheet gains no noise. Rows are NEVER
    /// merged here; this only adds explanatory text.
    /// </summary>
    private static void Disambiguate(List<ProductionPdfProductRow> rows, IReadOnlyList<OrderProductGroupRow> source)
    {
        if (rows.Count < 2)
            return;

        // Pass 1 — the usual real-world cause: same colour/size/production detail, different unit price.
        foreach (var bucket in DuplicateDisplayBuckets(rows))
        {
            if (bucket.Select(i => source[i].UnitPrice).Distinct().Count() <= 1)
                continue;

            foreach (var index in bucket)
                rows[index] = WithExtraLine(
                    rows[index], $"Unit price: {OrderProductGroupRowFormatter.Money(source[index].UnitPrice)}");
        }

        // Pass 2 — anything still identical differs only by a value the sheet deliberately never prints
        // (e.g. two variant ids behind one label). Mark them so they can never read as one collapsed line.
        foreach (var bucket in DuplicateDisplayBuckets(rows))
        {
            for (var n = 0; n < bucket.Count; n++)
                rows[bucket[n]] = WithExtraLine(
                    rows[bucket[n]], $"Production variant {n + 1} of {bucket.Count}");
        }
    }

    /// <summary>
    /// Indexes of rows sharing an identical rendering, grouped. <c>ToLookup</c> preserves source order,
    /// which is the builder's deterministic row order, so the output never depends on hashing order.
    /// </summary>
    private static List<List<int>> DuplicateDisplayBuckets(List<ProductionPdfProductRow> rows)
        => Enumerable.Range(0, rows.Count)
            .ToLookup(i => DisplayKey(rows[i]), StringComparer.Ordinal)
            .Where(bucket => bucket.Count() > 1)
            .Select(bucket => bucket.ToList())
            .ToList();

    private static string DisplayKey(ProductionPdfProductRow row)
        => $"{row.Colour}{DisplayKeyFieldSeparator}{row.Size}{DisplayKeyFieldSeparator}" +
           string.Join(DisplayKeyLineSeparator, row.ProductionLines);

    private static ProductionPdfProductRow WithExtraLine(ProductionPdfProductRow row, string line)
        => row with { ProductionLines = row.ProductionLines.Append(line).ToList() };
}
