using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Jira 10104 — deterministic ordering of the production sheet.
///
/// The product blocks take <see cref="OrderProductGroupBuilder"/>'s order verbatim (asserted here, not
/// re-derived). The three secondary sections — print production, Badge/design-only and Banner — used to
/// iterate in LINQ <c>GroupBy</c> encounter order, i.e. the order of <c>order.Items</c> (the Jira 10101
/// §7.4 determinism gap). They now have explicit comparators; because the sheet has no text extraction,
/// that is proven end to end by generating the same order with shuffled items and comparing PDF bytes.
/// </summary>
public sealed class OrderProductionPdfOrderingTests
{
    private static async Task<byte[]> GenerateAsync(OrderDto order)
        => (await new OrderProductionPdfService(new FakeOrderAppService(order)).GenerateAsync(order.Id)).Content;

    /// <summary>Same order, items supplied in a different sequence. Nothing else changes.</summary>
    private static OrderDto Reordered(OrderDto order, Func<IEnumerable<OrderItemDto>, IEnumerable<OrderItemDto>> reorder)
        => OrderProjectionFixtures.Order(reorder(order.Items).ToArray());

    // ── Product blocks ──────────────────────────────────────────────────────────

    [Fact]
    public void Product_sections_use_the_builders_order_and_are_never_re_sorted()
    {
        var order = OrderProjectionFixtures.MixedOrder();

        Assert.Equal(
            OrderProductGroupBuilder.Build(order).Select(g => g.GroupKey).ToList(),
            OrderProductionPdfModelBuilder.Build(order).Sections.Select(s => s.GroupKey).ToList());
    }

    [Fact]
    public void Product_kinds_are_ordered_garment_then_badge_then_banner()
    {
        var model = OrderProductionPdfModelBuilder.Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20)),
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 1)));

        Assert.Equal(
            new[] { ProductKind.Garment, ProductKind.Badge, ProductKind.Banner },
            model.Sections.Select(s => s.ProductKind).ToArray());
    }

    [Fact]
    public void Product_sections_are_ordered_by_name_then_by_product_id()
    {
        var model = OrderProductionPdfModelBuilder.Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 1,
                productId: OrderProjectionFixtures.TeeTwinProductId, productName: "Zip Hoodie"),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 1,
                productName: "Alpha Tee")));

        Assert.Equal(new[] { "Alpha Tee", "Zip Hoodie" }, model.Sections.Select(s => s.ProductName).ToArray());

        // Same name, different ids: the product-id tiebreak decides, deterministically.
        var twins = OrderProductionPdfModelBuilder.Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 1,
                productId: OrderProjectionFixtures.TeeTwinProductId, productName: "Staple Tee"),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 1)));

        Assert.Equal(
            new[] { OrderProjectionFixtures.TeeProductId, OrderProjectionFixtures.TeeTwinProductId },
            twins.Sections.Select(s => s.ProductId).ToArray());
    }

    [Fact]
    public void Rows_are_ordered_by_colour_then_apparel_size_with_missing_values_last()
    {
        var section = Assert.Single(OrderProductionPdfModelBuilder.Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(13), null, quantity: 1, variantId: OrderProjectionFixtures.Id(504)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(12), "White / S", quantity: 1, variantId: OrderProjectionFixtures.Id(503)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / XL", quantity: 1, variantId: OrderProjectionFixtures.Id(502)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / S", quantity: 1, variantId: OrderProjectionFixtures.Id(501)))).Sections);

        Assert.Equal(
            new[] { ("Black", "S"), ("Black", "XL"), ("White", "S"), ("—", "—") },
            section.Rows.Select(r => (r.Colour, r.Size)).ToArray());
    }

    [Fact]
    public void Same_colour_configurations_are_ordered_deterministically()
    {
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.BackAreaId, "Back", "BACK", OrderProjectionFixtures.A4SizeId, "A4", "A4"),
            }));

        var forward = OrderProductionPdfCompositionTests.Flatten(OrderProductionPdfModelBuilder.Build(order));
        var reversed = OrderProductionPdfCompositionTests.Flatten(
            OrderProductionPdfModelBuilder.Build(Reordered(order, i => i.Reverse())));

        Assert.Equal(forward, reversed);
    }

    [Fact]
    public void Shuffled_source_items_produce_an_identical_rendering_model()
    {
        foreach (var order in OrderProductionPdfCompositionTests.RepresentativeOrders())
        {
            if (order.Items.Count == 0)
                continue;

            var expected = OrderProductionPdfCompositionTests.Flatten(OrderProductionPdfModelBuilder.Build(order));

            foreach (var permutation in Permutations(order))
                Assert.Equal(
                    expected,
                    OrderProductionPdfCompositionTests.Flatten(OrderProductionPdfModelBuilder.Build(permutation)));
        }
    }

    // ── Secondary sections (proved through the generated document) ──────────────

    [Fact]
    public async Task Print_production_badge_and_banner_sections_no_longer_depend_on_item_encounter_order()
    {
        // Byte-for-byte equality across permutations is the strongest available evidence that no section
        // iterates in encounter order. Rendered inside one run so the minute-granular timestamp matches;
        // a rollover is retried rather than tolerated.
        var order = MultiDesignMixedOrder();

        foreach (var permutation in Permutations(order))
        {
            var equal = false;

            for (var attempt = 0; attempt < 3 && !equal; attempt++)
            {
                var baseline = await GenerateAsync(order);
                var shuffled = await GenerateAsync(permutation);
                equal = baseline.AsSpan().SequenceEqual(shuffled);
            }

            Assert.True(equal, "The generated sheet still depends on order.Items encounter order.");
        }
    }

    [Fact]
    public async Task A_badge_only_order_renders_identically_whatever_the_item_order()
    {
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21), quantity: 25, designNote: "Club logo"),
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(22), quantity: 50, designNote: "Away logo",
                uploadedAssetUrl: "/uploads/designs/badge_20260701_zzz999_away.png"),
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(23), quantity: 10, designNote: "Alt logo",
                productId: OrderProjectionFixtures.Id(5), productName: "Square Badge 50mm"));

        await AssertStableUnderPermutationAsync(order);
    }

    [Fact]
    public async Task A_banner_only_order_renders_identically_whatever_the_item_order()
    {
        var wide = OrderProjectionFixtures.CustomBannerDetail(width: 3m, height: 1m);
        var tall = OrderProjectionFixtures.CustomBannerDetail(width: 1m, height: 3m);

        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20), quantity: 2, detail: wide),
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(21), quantity: 4, detail: tall),
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(22), quantity: 1,
                detail: OrderProjectionFixtures.PresetBannerDetail(),
                productId: OrderProjectionFixtures.Id(6), productName: "Mesh Fence Banner"));

        await AssertStableUnderPermutationAsync(order);
    }

    private static async Task AssertStableUnderPermutationAsync(OrderDto order)
    {
        foreach (var permutation in Permutations(order))
        {
            var equal = false;

            for (var attempt = 0; attempt < 3 && !equal; attempt++)
            {
                var baseline = await GenerateAsync(order);
                var shuffled = await GenerateAsync(permutation);
                equal = baseline.AsSpan().SequenceEqual(shuffled);
            }

            Assert.True(equal, "The generated sheet still depends on order.Items encounter order.");
        }
    }

    private static IEnumerable<OrderDto> Permutations(OrderDto order)
    {
        yield return Reordered(order, i => i.Reverse());
        yield return Reordered(order, i => i.Skip(1).Concat(i.Take(1)));
        yield return Reordered(order, i => i.OrderByDescending(x => x.Quantity).ThenBy(x => x.Id.ToString("N"), StringComparer.Ordinal));
    }

    /// <summary>
    /// Several designs, areas and print sizes across two products, plus a Badge and two Banners — the
    /// shape where every one of the three secondary sections had an encounter-order dependency.
    /// </summary>
    private static OrderDto MultiDesignMixedOrder()
    {
        OrderItemPrintDto Print(int id, Guid area, string areaName, Guid size, string sizeName, string? url, string? note)
            => OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(id), area, areaName, "AREA", size, sizeName, "SIZE",
                uploadedAssetId: url is null ? null : OrderProjectionFixtures.Id(id + 500),
                uploadedAssetUrl: url, designNote: note);

        return OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3, prints: new[]
            {
                Print(1001, OrderProjectionFixtures.FrontAreaId, "Front", OrderProjectionFixtures.A3SizeId, "A3",
                    "/uploads/designs/logo_20260701_aaa111_zebra.png", null),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / L", quantity: 2,
                variantId: OrderProjectionFixtures.Id(501), prints: new[]
                {
                    Print(1002, OrderProjectionFixtures.BackAreaId, "Back", OrderProjectionFixtures.A4SizeId, "A4",
                        "/uploads/designs/logo_20260701_bbb222_apple.png", "Crest"),
                }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(12), "White / M", quantity: 4,
                variantId: OrderProjectionFixtures.Id(502),
                productId: OrderProjectionFixtures.TeeTwinProductId, productName: "Heavy Tee", prints: new[]
                {
                    Print(1003, OrderProjectionFixtures.FrontAreaId, "Front", OrderProjectionFixtures.A3SizeId, "A3",
                        "/uploads/designs/logo_20260701_ccc333_zebra.png", null),
                    Print(1004, OrderProjectionFixtures.FrontAreaId, "Front", OrderProjectionFixtures.A4SizeId, "A4",
                        "/uploads/designs/logo_20260701_ddd444_mango.png", "Sleeve"),
                }),
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(14)),
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(15)),
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(16), quantity: 3,
                detail: OrderProjectionFixtures.CustomBannerDetail()));
    }
}
