using System;

namespace TeeNova.Orders;

/// <summary>
/// The single shared, pure parser for an <c>OrderItem.VariantLabel</c> snapshot (usually "Color / Size")
/// (Jira 9403; consolidated in Jira 10103). No DB access, no side effects, no culture dependence.
///
/// Split rule: on the LAST " / " so colors that contain a slash stay intact — "Navy / White / XL"
/// parses as color "Navy / White", size "XL". Used by <c>OrderPrintGroupBuilder</c> (where color and
/// garment size are display-only row details that must NEVER influence print grouping),
/// <c>OrderProductGroupBuilder</c> (where they ARE part of the child-row key), and
/// <c>OrderProductionPdfService</c>, which previously carried a private duplicate of this logic.
///
/// Null/blank policy: <see cref="Parse"/> reports a genuinely absent part as <c>null</c> and never
/// fabricates a value; <see cref="ParseForDisplay"/> is the rendering-boundary variant that returns
/// empty strings instead, preserving the production sheet's long-standing visible behaviour.
/// </summary>
public static class OrderVariantLabelParser
{
    /// <summary>
    /// Splits a variant label into (Color, GarmentSize). The label is trimmed FIRST, then the last
    /// " / " (space-slash-space) is located; when there is no such separator the whole trimmed label is
    /// treated as the color and garment size is null. Each part is trimmed, and a blank part becomes
    /// null. Exact behaviour, unchanged since Jira 9403 and shared with the production sheet:
    /// <list type="bullet">
    ///   <item>null / "" / "   "   =&gt; (null, null)</item>
    ///   <item>"Black / M"         =&gt; ("Black", "M")</item>
    ///   <item>"  Black / M  "     =&gt; ("Black", "M")            (outer whitespace trimmed)</item>
    ///   <item>"Black  /  M"       =&gt; ("Black", "M")            (inner padding trimmed per part)</item>
    ///   <item>"Navy / White / XL" =&gt; ("Navy / White", "XL")    (LAST delimiter wins)</item>
    ///   <item>"OneSize"           =&gt; ("OneSize", null)         (no delimiter)</item>
    ///   <item>"Black/M"           =&gt; ("Black/M", null)         (delimiter needs both spaces)</item>
    /// </list>
    /// Because the outer trim happens first, a delimiter that touches the edge of the raw value stops
    /// being a delimiter — the malformed label is then reported verbatim as the colour rather than
    /// being repaired or discarded:
    /// <list type="bullet">
    ///   <item>" / M"    =&gt; ("/ M", null)     (trimmed to "/ M"; no " / " remains)</item>
    ///   <item>"Black / "=&gt; ("Black /", null) (trimmed to "Black /"; no trailing space remains)</item>
    ///   <item>" / "     =&gt; ("/", null)</item>
    /// </list>
    /// Never throws.
    /// </summary>
    public static (string? Color, string? GarmentSize) Parse(string? variantLabel)
    {
        var label = variantLabel?.Trim() ?? string.Empty;
        if (label.Length == 0)
            return (null, null);

        var idx = label.LastIndexOf(" / ", StringComparison.Ordinal);
        if (idx < 0)
            return (label, null);

        var color = label[..idx].Trim();
        var size = label[(idx + 3)..].Trim();

        return (
            color.Length == 0 ? null : color,
            size.Length == 0 ? null : size);
    }

    /// <summary>
    /// Rendering-boundary variant of <see cref="Parse"/>: identical splitting, with absent parts
    /// projected to <see cref="string.Empty"/> instead of null. This reproduces exactly what the
    /// production sheet's former private <c>SplitVariantLabel</c> returned, so ordering, grouping and
    /// the rendered "Colour / sizes" text are unchanged by the consolidation.
    /// </summary>
    public static (string Color, string Size) ParseForDisplay(string? variantLabel)
    {
        var (color, size) = Parse(variantLabel);
        return (color ?? string.Empty, size ?? string.Empty);
    }
}
