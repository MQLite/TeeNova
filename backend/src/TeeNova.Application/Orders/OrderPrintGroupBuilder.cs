using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Builds the additive grouped print read model (Jira 9403 / Epic 9400) from an already-enriched
/// <see cref="OrderDto"/>. Pure and deterministic: no DB access, no side effects, no mutation of the
/// input DTO or any price/quantity snapshot.
///
/// Order print content is grouped by <b>design + print position (PrintArea) + print size (PrintSize)</b>.
/// Garment color, garment size, product variant id, product name, quantity and price are deliberately
/// NOT part of the group key. A single <c>OrderItem</c> with multiple prints fans out into multiple
/// groups (one membership per print). Items without prints are excluded from the grouped model (the
/// frontend surfaces them in a separate "no print / garment only" section in 9404).
/// </summary>
public static class OrderPrintGroupBuilder
{
    public const string UnknownPrintArea = "Unknown print position";
    public const string UnknownPrintSize = "Unknown print size";

    public static List<OrderPrintGroupDto> Build(OrderDto order)
    {
        var groups = new List<OrderPrintGroupDto>();
        if (order?.Items == null || order.Items.Count == 0)
            return groups;

        // Fan out (item × its prints) into candidate memberships, deriving the design identity per print.
        var candidates = new List<Candidate>();
        foreach (var item in order.Items)
        {
            if (item.Prints == null || item.Prints.Count == 0)
                continue; // items without prints are not part of PrintGroups

            foreach (var print in item.Prints)
            {
                var (designName, designKey) = OrderDesignNameResolver.Resolve(print.UploadedAssetUrl);
                var groupKey = $"{designKey}|{print.PrintAreaId:N}|{print.PrintSizeId:N}";
                candidates.Add(new Candidate(groupKey, designName, designKey, item, print));
            }
        }

        // Group by the composite key — color/size/variant/product/quantity/price are NOT in the key.
        foreach (var grp in candidates.GroupBy(c => c.GroupKey))
        {
            var first = grp.First();

            var areaName = string.IsNullOrWhiteSpace(first.Print.PrintAreaName)
                ? UnknownPrintArea : first.Print.PrintAreaName;
            var sizeName = string.IsNullOrWhiteSpace(first.Print.PrintSizeName)
                ? UnknownPrintSize : first.Print.PrintSizeName;

            var rows = grp
                .Select(c => BuildRow(c.Item, c.Print))
                .OrderBy(r => r.ProductName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(r => r.Color ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ThenBy(r => r.GarmentSize ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ThenBy(r => r.OrderItemId)
                .ToList();

            groups.Add(new OrderPrintGroupDto
            {
                GroupKey = first.GroupKey,
                DesignName = first.DesignName,
                DesignKey = first.DesignKey,
                PrintAreaId = first.Print.PrintAreaId,
                PrintAreaName = areaName,
                PrintAreaCode = first.Print.PrintAreaCode,
                PrintSizeId = first.Print.PrintSizeId,
                PrintSizeName = sizeName,
                PrintSizeCode = first.Print.PrintSizeCode,
                // Display-only aggregate; financial totals come from Order.TotalAmount, never from here.
                TotalQuantity = grp.Sum(c => c.Item.Quantity),
                Rows = rows,
            });
        }

        return groups
            .OrderBy(g => g.DesignName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.PrintAreaName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.PrintSizeName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.GroupKey, StringComparer.Ordinal)
            .ToList();
    }

    private static OrderPrintGroupRowDto BuildRow(OrderItemDto item, OrderItemPrintDto print)
    {
        var (color, garmentSize) = OrderVariantLabelParser.Parse(item.VariantLabel);

        // Legacy = pre-9203 print row (no resolved tier price snapshot). Display-only flag; pricing is
        // never recomputed and Row.UnitPrice/LineTotal stay the authoritative whole-item snapshot.
        var isLegacy = print.ResolvedUnitPrintPrice == 0m && print.AppliedPrintTierMinQuantity == null;

        return new OrderPrintGroupRowDto
        {
            OrderItemId = item.Id,
            OrderItemPrintId = print.Id,
            ProductName = item.ProductName,
            VariantLabel = item.VariantLabel,
            Color = color,
            GarmentSize = garmentSize,
            Quantity = item.Quantity,
            UnitPrice = item.UnitPrice,
            LineTotal = item.LineTotal, // computed snapshot: UnitPrice × Quantity
            UploadedAssetId = print.UploadedAssetId,
            UploadedAssetUrl = print.UploadedAssetUrl,
            DesignNote = print.DesignNote,
            PrintNotes = print.Notes,
            ResolvedUnitPrintPrice = print.ResolvedUnitPrintPrice,
            AppliedPrintTierMinQuantity = print.AppliedPrintTierMinQuantity,
            IsLegacyPricingSnapshot = isLegacy,
        };
    }

    private readonly record struct Candidate(
        string GroupKey,
        string DesignName,
        string DesignKey,
        OrderItemDto Item,
        OrderItemPrintDto Print);
}
