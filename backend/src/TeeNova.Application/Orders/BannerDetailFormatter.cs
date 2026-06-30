using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace TeeNova.Orders;

/// <summary>
/// Shared, null-safe formatting for Banner configuration (Jira 9514), used by the production PDF and
/// order email templates so Banner detail renders identically and never duplicates logic. Methods take
/// raw field values (not a DTO/entity) so both the <c>BannerDetailDto</c> (PDF, from OrderDto) and the
/// domain <c>OrderItemBannerDetail</c> (email, from the Order aggregate) can call them.
/// </summary>
public static class BannerDetailFormatter
{
    /// <summary>"850×2000 mm (1.7 m²)" for custom sizes, the preset label otherwise, or "—".</summary>
    public static string SizeSummary(
        BannerSizeMode sizeMode, decimal? width, decimal? height,
        BannerDimensionUnit? unit, decimal? areaSquareMetres, string? sizeLabel)
    {
        if (sizeMode == BannerSizeMode.Custom && width is > 0m && height is > 0m)
        {
            var w = width.Value.ToString("0.####", CultureInfo.InvariantCulture);
            var h = height.Value.ToString("0.####", CultureInfo.InvariantCulture);
            var u = UnitLabel(unit);
            var area = areaSquareMetres is > 0m
                ? $" ({areaSquareMetres.Value.ToString("0.####", CultureInfo.InvariantCulture)} m²)"
                : string.Empty;
            return $"{w}×{h}{(string.IsNullOrEmpty(u) ? "" : " " + u)}{area}";
        }

        return string.IsNullOrWhiteSpace(sizeLabel) ? "—" : sizeLabel!.Trim();
    }

    /// <summary>Friendly material name; the free-text name when material is Other.</summary>
    public static string MaterialSummary(BannerMaterial material, string? materialDisplayName)
        => material == BannerMaterial.Other && !string.IsNullOrWhiteSpace(materialDisplayName)
            ? materialDisplayName!.Trim()
            : material switch
            {
                BannerMaterial.PullUp => "Pull-up",
                BannerMaterial.Pvc    => "PVC",
                BannerMaterial.Mesh   => "Mesh",
                BannerMaterial.Fabric => "Fabric",
                BannerMaterial.Other  => "Other",
                _                     => material.ToString(),
            };

    /// <summary>Comma-joined finishing/stand options, or "None".</summary>
    public static string FinishingSummary(
        bool eyelets, bool hemming, bool polePocket, string? finishingOther,
        bool standIncluded, bool standReplacementOnly)
    {
        var parts = new List<string>();
        if (eyelets) parts.Add("Eyelets");
        if (hemming) parts.Add("Hemming");
        if (polePocket) parts.Add("Pole pocket");
        if (standIncluded) parts.Add("Stand included");
        if (standReplacementOnly) parts.Add("Stand replacement only");
        if (!string.IsNullOrWhiteSpace(finishingOther)) parts.Add(finishingOther!.Trim());
        return parts.Count > 0 ? string.Join(", ", parts) : "None";
    }

    public static string UnitLabel(BannerDimensionUnit? unit) => unit switch
    {
        BannerDimensionUnit.Mm => "mm",
        BannerDimensionUnit.Cm => "cm",
        BannerDimensionUnit.M  => "m",
        _                      => string.Empty,
    };
}
