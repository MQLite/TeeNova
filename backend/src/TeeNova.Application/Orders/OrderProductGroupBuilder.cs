using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Builds the product-first read model (Jira 10103) from an already-loaded <see cref="OrderDto"/>
/// snapshot, for the future grouped production sheet (Jira 10104) and print statistics (Jira 10106).
///
/// Pure and deterministic: no DB access, no repository, no dependency injection, no catalogue lookup,
/// no pricing, no authorization, no side effects, and no mutation of the input DTO or any nested
/// collection. Output order never depends on the encounter order of <c>order.Items</c>.
///
/// <b>Outer key</b> - <c>(ProductId, ProductKind, PricingModel)</c>. Product name, category,
/// product-type label, variant label, colour, size, design and print pricing group are NEVER part of it,
/// so items with different <c>ProductId</c> values can never merge even when their names are identical.
///
/// <b>Child key</b> - the complete production-significant signature of an order item:
/// <c>(ProductVariantId, Colour, Size, UnitPrice, AppliedQuantityTierMinQuantity, PrintSignature,
/// BannerSignature, ItemDesignSignature)</c>. Two items are folded into one row ONLY when that entire
/// key matches; the row then sums their quantities and keeps every source <c>OrderItem.Id</c>.
///
/// Deliberately NOT modelled on <see cref="OrderPrintGroupBuilder"/>'s design-first key (Jira 9403):
/// only its pure-static-builder shape is reused.
/// </summary>
public static class OrderProductGroupBuilder
{
    /// <summary>
    /// Signature field separator (ASCII Unit Separator, 0x1F). Written as a numeric expression rather
    /// than a literal so no invisible control character appears in the source. Collision safety comes
    /// from the length prefix in <see cref="AppendText"/>, not from this character.
    /// </summary>
    private const char FieldSeparator = (char)0x1F;

    public static List<OrderProductGroup> Build(OrderDto order)
    {
        var groups = new List<OrderProductGroup>();
        if (order?.Items == null || order.Items.Count == 0)
            return groups;

        // Deterministic source-item ordering, used for the display-name choice and as the final
        // tiebreak everywhere below. Input encounter order is never allowed to reach the output.
        var items = order.Items
            .OrderBy(i => i.Id.ToString("N"), StringComparer.Ordinal)
            .ToList();

        foreach (var productGroup in items.GroupBy(OuterKey))
        {
            var (productId, productKind, pricingModel) = productGroup.Key;

            var rows = productGroup
                .Select(item =>
                {
                    var prints = OrderPrints(item);
                    return new { Item = item, Prints = prints, Key = ChildKey(item, prints) };
                })
                .GroupBy(x => x.Key, StringComparer.Ordinal)
                .Select(rowGroup => BuildRow(
                    rowGroup.Key,
                    rowGroup.Select(x => x.Item).ToList(),
                    rowGroup.First().Prints))
                .OrderBy(r => r.Colour == null)                                          // missing colour last
                .ThenBy(r => r.Colour ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ThenBy(r => r.Colour ?? string.Empty, StringComparer.Ordinal)
                .ThenBy(r => GarmentSizeOrder.Rank(r.Size))
                .ThenBy(r => r.Size ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ThenBy(r => r.Size ?? string.Empty, StringComparer.Ordinal)
                .ThenBy(r => r.UnitPrice)
                .ThenBy(r => r.RowKey, StringComparer.Ordinal)
                .ThenBy(r => r.SourceOrderItemIds[0].ToString("N"), StringComparer.Ordinal)
                .ToList();

            groups.Add(new OrderProductGroup
            {
                GroupKey = GroupKey(productId, productKind, pricingModel),
                ProductId = productId,
                ProductKind = productKind,
                PricingModel = pricingModel,
                // A name disagreement inside one ProductId (only reachable with corrupted or hand-edited
                // history) must not split the group: take the first non-blank snapshot in deterministic
                // item order, falling back to the first value when every snapshot is blank.
                ProductName = productGroup
                                  .Select(i => i.ProductName)
                                  .FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))
                              ?? productGroup.First().ProductName
                              ?? string.Empty,
                TotalQuantity = rows.Sum(r => r.Quantity),
                Rows = rows,
            });
        }

        return groups
            .OrderBy(g => KindRank(g.ProductKind))
            .ThenBy(g => g.ProductName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.ProductName, StringComparer.Ordinal)
            .ThenBy(g => g.ProductId.ToString("N"), StringComparer.Ordinal)
            .ThenBy(g => g.GroupKey, StringComparer.Ordinal)
            .ToList();
    }

    // -- Keys --------------------------------------------------------------------

    private static (Guid ProductId, ProductKind ProductKind, PricingModel PricingModel) OuterKey(OrderItemDto item)
        => (
            item.ProductId ??
            item.OrderAdHocProductSnapshotId ??
            throw new InvalidOperationException("An order item has no product source identity."),
            item.ProductKind,
            item.PricingModel);

    private static string GroupKey(Guid productId, ProductKind kind, PricingModel model)
        => $"{productId:N}|{kind}|{model}";

    /// <summary>
    /// Category order on the sheet: Garment, Badge, Banner, then anything else - including an enum value
    /// outside the current definition, which is ranked last rather than throwing.
    /// </summary>
    private static int KindRank(ProductKind kind) => kind switch
    {
        ProductKind.Garment => 0,
        ProductKind.Badge => 1,
        ProductKind.Banner => 2,
        ProductKind.Other => 3,
        _ => 4,
    };

    /// <summary>
    /// The complete production-significant child key. Every part is length-prefixed so no combination of
    /// free-text notes can forge a collision, and every value comes from the immutable snapshot.
    /// </summary>
    private static string ChildKey(OrderItemDto item, IReadOnlyList<OrderProductGroupPrint> orderedPrints)
    {
        var (colour, size) = OrderVariantLabelParser.Parse(item.VariantLabel);

        var sb = new StringBuilder();
        AppendGuid(sb, "variant", item.ProductVariantId);
        AppendText(sb, "colour", colour);
        AppendText(sb, "size", size);
        AppendText(sb, "unitPrice", item.UnitPrice.ToString(CultureInfo.InvariantCulture));
        AppendText(sb, "qtyTier", item.AppliedQuantityTierMinQuantity?.ToString(CultureInfo.InvariantCulture));

        AppendPrintSignature(sb, orderedPrints);
        AppendBannerSignature(sb, item.BannerDetail);
        AppendItemDesignSignature(sb, item);

        return sb.ToString();
    }

    /// <summary>
    /// Print signature over the whole placement set. Prints are ordered by their production meaning
    /// first (area, size, artwork, notes, resolved price, tier), so the SAME placements supplied in a
    /// different array order produce the SAME key. <c>OrderItemPrint.SortOrder</c> and the print's own
    /// id are excluded: neither changes what is produced.
    /// </summary>
    private static void AppendPrintSignature(StringBuilder sb, IReadOnlyList<OrderProductGroupPrint> prints)
    {
        AppendText(sb, "printCount", prints.Count.ToString(CultureInfo.InvariantCulture));
        foreach (var print in prints)
        {
            AppendGuid(sb, "area", print.PrintAreaId);
            AppendGuid(sb, "psize", print.PrintSizeId);
            AppendGuid(sb, "asset", print.UploadedAssetId);
            AppendText(sb, "assetUrl", print.UploadedAssetUrl);
            AppendText(sb, "designNote", print.DesignNote);
            AppendText(sb, "notes", print.Notes);
            AppendText(sb, "printPrice", print.ResolvedUnitPrintPrice.ToString(CultureInfo.InvariantCulture));
            AppendText(sb, "printTier", print.AppliedPrintTierMinQuantity?.ToString(CultureInfo.InvariantCulture));
        }
    }

    /// <summary>
    /// Every persisted Banner value that changes what is produced - dimensions and finishing included,
    /// precisely because Banner items carry no colour or size.
    /// </summary>
    private static void AppendBannerSignature(StringBuilder sb, BannerDetailDto? banner)
    {
        if (banner == null)
        {
            AppendText(sb, "banner", null);
            return;
        }

        AppendText(sb, "bannerSizeMode", banner.SizeMode.ToString());
        AppendGuid(sb, "bannerPreset", banner.SizePresetId);
        AppendText(sb, "bannerSizeLabel", banner.SizeLabel);
        AppendText(sb, "bannerWidth", banner.Width?.ToString(CultureInfo.InvariantCulture));
        AppendText(sb, "bannerHeight", banner.Height?.ToString(CultureInfo.InvariantCulture));
        AppendText(sb, "bannerUnit", banner.Unit?.ToString());
        AppendText(sb, "bannerArea", banner.AreaSquareMetres?.ToString(CultureInfo.InvariantCulture));
        AppendText(sb, "bannerMaterial", banner.Material.ToString());
        AppendText(sb, "bannerMaterialName", banner.MaterialDisplayName);
        AppendText(sb, "bannerEyelets", banner.FinishingEyelets ? "1" : "0");
        AppendText(sb, "bannerHemming", banner.FinishingHemming ? "1" : "0");
        AppendText(sb, "bannerPolePocket", banner.FinishingPolePocket ? "1" : "0");
        AppendText(sb, "bannerFinishingOther", banner.FinishingOther);
        AppendText(sb, "bannerStand", banner.StandIncluded ? "1" : "0");
        AppendText(sb, "bannerStandReplacement", banner.StandReplacementOnly ? "1" : "0");
        AppendText(sb, "bannerNotes", banner.Notes);
    }

    /// <summary>Item-level design used by Badge/Banner; null for garments (their design lives per print).</summary>
    private static void AppendItemDesignSignature(StringBuilder sb, OrderItemDto item)
    {
        AppendGuid(sb, "itemAsset", item.UploadedAssetId);
        AppendText(sb, "itemAssetUrl", item.UploadedAssetUrl);
        AppendText(sb, "itemDesignNote", item.DesignNote);
    }

    // Length-prefixed so a value containing the separator cannot forge another field's boundary, and a
    // genuine null stays distinguishable from an empty string ("-1:" vs "0:").
    private static void AppendText(StringBuilder sb, string field, string? value)
        => sb.Append(field).Append('=')
             .Append(value is null ? -1 : value.Length).Append(':')
             .Append(value).Append(FieldSeparator);

    private static void AppendGuid(StringBuilder sb, string field, Guid? value)
        => AppendText(sb, field, value?.ToString("N"));

    // -- Row construction --------------------------------------------------------

    /// <summary>
    /// Copies the item's prints into the projection in deterministic signature order. LINQ ordering
    /// produces a new sequence, so the caller's <c>OrderItemDto.Prints</c> list is never reordered.
    /// </summary>
    private static IReadOnlyList<OrderProductGroupPrint> OrderPrints(OrderItemDto item)
    {
        if (item.Prints == null || item.Prints.Count == 0)
            return Array.Empty<OrderProductGroupPrint>();

        return item.Prints
            .Select(p => new OrderProductGroupPrint
            {
                PrintAreaId = p.PrintAreaId,
                PrintAreaName = p.PrintAreaName,
                PrintAreaCode = p.PrintAreaCode,
                PrintSizeId = p.PrintSizeId,
                PrintSizeName = p.PrintSizeName,
                PrintSizeCode = p.PrintSizeCode,
                UploadedAssetId = p.UploadedAssetId,
                UploadedAssetUrl = p.UploadedAssetUrl,
                DesignNote = p.DesignNote,
                Notes = p.Notes,
                ResolvedUnitPrintPrice = p.ResolvedUnitPrintPrice,
                AppliedPrintTierMinQuantity = p.AppliedPrintTierMinQuantity,
            })
            .OrderBy(p => p.PrintAreaId.ToString("N"), StringComparer.Ordinal)
            .ThenBy(p => p.PrintSizeId.ToString("N"), StringComparer.Ordinal)
            .ThenBy(p => p.UploadedAssetId?.ToString("N") ?? string.Empty, StringComparer.Ordinal)
            .ThenBy(p => p.UploadedAssetUrl ?? string.Empty, StringComparer.Ordinal)
            .ThenBy(p => p.DesignNote ?? string.Empty, StringComparer.Ordinal)
            .ThenBy(p => p.Notes ?? string.Empty, StringComparer.Ordinal)
            .ThenBy(p => p.ResolvedUnitPrintPrice)
            .ThenBy(p => p.AppliedPrintTierMinQuantity ?? int.MinValue)
            .ToList();
    }

    private static OrderProductGroupRow BuildRow(
        string rowKey,
        IReadOnlyList<OrderItemDto> sourceItems,
        IReadOnlyList<OrderProductGroupPrint> orderedPrints)
    {
        // sourceItems arrive in the deterministic item order established in Build.
        var first = sourceItems[0];
        var (colour, size) = OrderVariantLabelParser.Parse(first.VariantLabel);

        return new OrderProductGroupRow
        {
            RowKey = rowKey,
            ProductVariantId = first.ProductVariantId,
            Colour = colour,
            Size = size,
            VariantLabel = first.VariantLabel,
            Quantity = sourceItems.Sum(i => i.Quantity),
            UnitPrice = first.UnitPrice, // identical across the row by construction; never averaged
            AppliedQuantityTierMinQuantity = first.AppliedQuantityTierMinQuantity,
            UploadedAssetId = first.UploadedAssetId,
            UploadedAssetUrl = first.UploadedAssetUrl,
            DesignNote = first.DesignNote,
            BannerDetail = first.BannerDetail,
            Prints = orderedPrints,
            SourceOrderItemIds = sourceItems
                .Select(i => i.Id)
                .OrderBy(id => id.ToString("N"), StringComparer.Ordinal)
                .ToList(),
        };
    }
}
