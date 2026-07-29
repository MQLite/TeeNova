using System;
using System.Collections.Generic;
using System.Globalization;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Pure, display-only formatting for the grouped production sheet (Jira 10104). Turns an
/// <see cref="OrderProductGroupRow"/> — which carries only semantic snapshot values — into the strings
/// the PDF prints, so QuestPDF composition stays thin and every label is unit-testable.
///
/// Deliberately the ONLY place display fallbacks live. <see cref="OrderProductGroupBuilder"/> must keep
/// reporting a genuinely absent value as <c>null</c>: a fallback character can never enter a semantic
/// grouping key.
///
/// No DB access, no catalogue lookup, no pricing, no mutation. Design names come from the shared
/// <see cref="OrderDesignNameResolver"/> (no third parser is created), Banner text from the shared
/// <see cref="BannerDetailFormatter"/>.
///
/// Nothing here emits a source order-item id, a row key, a signature, an internal Guid, a pricing-group
/// id or a storage path — <see cref="OrderDesignNameResolver"/> reduces an upload URL to its bare
/// filename, which is what the production floor needs.
/// </summary>
internal static class OrderProductGroupRowFormatter
{
    /// <summary>Rendered for a genuinely absent colour or size. Never <c>null</c>, "", or whitespace.</summary>
    public const string MissingValue = "—";

    /// <summary>Controlled label for a blank/whitespace-only product-name snapshot.</summary>
    public const string UnnamedProduct = "Unnamed product";

    /// <summary>Controlled label for a blank snapshotted print-area or print-size name.</summary>
    public const string UnspecifiedPrintLabel = "Unspecified";

    /// <summary>A garment row that carries no print placements stays visible with this label.</summary>
    public const string NoPrintPlacements = "No print placements";

    /// <summary>Matches the existing Banner section's wording when the structured snapshot is missing.</summary>
    public const string BannerDetailsUnavailable = "Banner details unavailable";

    /// <summary>Shown when a non-garment item carries no artwork and no design note at all.</summary>
    public const string NoDesignUploaded = "No design uploaded";

    /// <summary>Culture-independent NZD money formatting, e.g. "1,250.00 NZD" (shared with the sheet).</summary>
    public static string Money(decimal value)
        => $"{value.ToString("N2", CultureInfo.InvariantCulture)} NZD";

    /// <summary>
    /// Display product name: the snapshot when it has content, otherwise the controlled
    /// <see cref="UnnamedProduct"/> label. Display formatting only — the builder's semantic key and its
    /// <c>ProductName</c> snapshot are untouched.
    /// </summary>
    public static string ProductName(string? snapshotName)
        => string.IsNullOrWhiteSpace(snapshotName) ? UnnamedProduct : snapshotName!.Trim();

    /// <summary>
    /// Product-kind label shown in the product header. Null for Garment, where the colour/size columns
    /// already make the kind obvious; a non-garment item is labelled because it has none.
    /// </summary>
    public static string? KindLabel(ProductKind kind) => kind switch
    {
        ProductKind.Garment => null,
        ProductKind.Badge => "Badge",
        ProductKind.Banner => "Banner",
        ProductKind.Other => "Other",
        _ => "Unspecified type",
    };

    /// <summary>
    /// Colour cell. Falls back to the raw <c>VariantLabel</c> snapshot only when parsing produced nothing
    /// usable but the label still carries text (a defensive path — the parser already returns the whole
    /// trimmed label as the colour when it cannot split it), then to <see cref="MissingValue"/>.
    /// </summary>
    public static string Colour(OrderProductGroupRow row)
    {
        if (!string.IsNullOrWhiteSpace(row.Colour))
            return row.Colour!.Trim();

        if (!string.IsNullOrWhiteSpace(row.VariantLabel))
            return row.VariantLabel!.Trim();

        return MissingValue;
    }

    /// <summary>Size cell, or <see cref="MissingValue"/> when the snapshot genuinely has no size.</summary>
    public static string Size(OrderProductGroupRow row)
        => string.IsNullOrWhiteSpace(row.Size) ? MissingValue : row.Size!.Trim();

    /// <summary>
    /// The production-detail cell as individual lines. Always returns at least one non-blank line, so a
    /// row is never rendered with an empty production column and no row is ever dropped for missing data.
    /// </summary>
    public static IReadOnlyList<string> ProductionLines(OrderProductGroupRow row, ProductKind kind)
    {
        var lines = new List<string>();

        if (kind == ProductKind.Garment)
            AppendGarmentLines(lines, row);
        else
            AppendNonGarmentLines(lines, row);

        // Part of the builder's child key, so two rows can differ by nothing else. Shown for every kind.
        if (row.AppliedQuantityTierMinQuantity.HasValue)
            lines.Add($"Quantity tier: {row.AppliedQuantityTierMinQuantity.Value.ToString(CultureInfo.InvariantCulture)}+");

        if (lines.Count == 0)
            lines.Add(MissingValue);

        return lines;
    }

    /// <summary>The production-detail cell as one string; QuestPDF renders the embedded line breaks.</summary>
    public static string ProductionSummary(OrderProductGroupRow row, ProductKind kind)
        => string.Join("\n", ProductionLines(row, kind));

    // ── Garment ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// One line per placement — "{Print area} {Print size}", plus the design when the placement carries
    /// artwork or a design note — followed by that placement's production note on its own line so the
    /// core placement stays readable. Prints arrive in the builder's deterministic order.
    /// </summary>
    private static void AppendGarmentLines(List<string> lines, OrderProductGroupRow row)
    {
        foreach (var print in row.Prints)
        {
            var area = Label(print.PrintAreaName);
            var size = Label(print.PrintSizeName);
            var design = DesignLabel(print.UploadedAssetUrl, print.DesignNote);

            lines.Add(design is null ? $"{area} {size}" : $"{area} {size} — {design}");

            if (!string.IsNullOrWhiteSpace(print.Notes))
                lines.Add($"Note: {print.Notes!.Trim()}");
        }

        if (row.Prints.Count == 0)
            lines.Add(NoPrintPlacements);

        // Garments normally carry their design per print, but an item-level design is persisted data and
        // must not silently disappear from the sheet when one exists.
        var itemDesign = DesignLabel(row.UploadedAssetUrl, row.DesignNote);
        if (itemDesign is not null)
            lines.Add($"Design: {itemDesign}");
    }

    // ── Badge / Banner / Other ──────────────────────────────────────────────────

    /// <summary>
    /// Compact, kind-aware detail for a product with no garment colour or size: the Banner configuration
    /// that is the only thing distinguishing two banner lines, then the item-level design.
    /// </summary>
    private static void AppendNonGarmentLines(List<string> lines, OrderProductGroupRow row)
    {
        // Defensive: a non-garment snapshot should have no variant label, but if one exists it is real
        // persisted data and is shown rather than dropped.
        if (!string.IsNullOrWhiteSpace(row.VariantLabel))
            lines.Add(row.VariantLabel!.Trim());

        AppendBannerLines(lines, row.BannerDetail);

        var design = DesignLabel(row.UploadedAssetUrl, row.DesignNote);
        lines.Add($"Design: {design ?? NoDesignUploaded}");
    }

    private static void AppendBannerLines(List<string> lines, BannerDetailDto? detail)
    {
        if (detail == null)
            return;

        // One compact configuration line: size · material · finishing. The existing "Banner production
        // details" section keeps the fully labelled multi-line form; this is the row-distinguishing index.
        var configuration = string.Join("  ·  ", new[]
        {
            BannerDetailFormatter.SizeSummary(
                detail.SizeMode, detail.Width, detail.Height, detail.Unit,
                detail.AreaSquareMetres, detail.SizeLabel),
            BannerDetailFormatter.MaterialSummary(detail.Material, detail.MaterialDisplayName),
            BannerDetailFormatter.FinishingSummary(
                detail.FinishingEyelets, detail.FinishingHemming, detail.FinishingPolePocket,
                detail.FinishingOther, detail.StandIncluded, detail.StandReplacementOnly),
        });

        lines.Add(configuration);

        if (!string.IsNullOrWhiteSpace(detail.Notes))
            lines.Add($"Banner notes: {detail.Notes!.Trim()}");
    }

    // ── Shared bits ─────────────────────────────────────────────────────────────

    /// <summary>A snapshotted print-area/print-size name, or the controlled unspecified fallback.</summary>
    private static string Label(string? snapshotName)
        => string.IsNullOrWhiteSpace(snapshotName) ? UnspecifiedPrintLabel : snapshotName!.Trim();

    /// <summary>
    /// "{artwork file name} — {design note}", either part alone, or <c>null</c> when neither exists.
    /// The file name comes from the shared <see cref="OrderDesignNameResolver"/>, which strips the
    /// storage-generated upload prefix and never emits a scheme, host, query, fragment or directory.
    /// </summary>
    public static string? DesignLabel(string? uploadedAssetUrl, string? designNote)
    {
        var note = string.IsNullOrWhiteSpace(designNote) ? null : designNote!.Trim();
        var file = string.IsNullOrWhiteSpace(uploadedAssetUrl)
            ? null
            : OrderDesignNameResolver.Resolve(uploadedAssetUrl).DesignName;

        if (file is not null && note is not null)
            return $"{file} — {note}";

        return file ?? note;
    }
}
