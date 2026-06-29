using System;

namespace TeeNova.Orders;

/// <summary>
/// Pure, deterministic parsing of an <c>OrderItem.VariantLabel</c> snapshot (usually "Color / Size")
/// into its display-only color and garment-size parts (Jira 9403). No DB access, no side effects.
///
/// Mirrors the production PDF's <c>SplitVariantLabel</c>: split on the LAST " / " so colors that contain
/// a slash stay intact. Color and garment size are display-only row details and must NEVER influence
/// print grouping.
/// </summary>
public static class OrderVariantLabelParser
{
    /// <summary>
    /// Splits a variant label into (Color, GarmentSize). When there is no " / " separator the whole
    /// label is treated as the color and garment size is null. Blank parts become null.
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
}
