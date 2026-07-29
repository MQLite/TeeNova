using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;
using static TeeNova.Orders.OrderProjectionFixtures;

namespace TeeNova.Orders;

/// <summary>
/// The product-first projection (Jira 10103). Covers the outer key, the complete production-significant
/// child key, aggregation and traceability, reconciliation, ordering, purity and historical-snapshot
/// behaviour. Every fixture is snapshot data only — no repository, no catalogue, no DI.
/// </summary>
public sealed class OrderProductGroupBuilderTests
{
    // ── Outer key ────────────────────────────────────────────────────────────────

    [Fact]
    public void Empty_order_produces_no_groups()
    {
        Assert.Empty(OrderProductGroupBuilder.Build(Order()));
        Assert.Empty(OrderProductGroupBuilder.Build(new OrderDto()));
    }

    [Fact]
    public void One_product_with_one_item_produces_one_group_and_one_row()
    {
        var groups = OrderProductGroupBuilder.Build(Order(Garment(Id(10), "Black / M", quantity: 3)));

        var group = Assert.Single(groups);
        Assert.Equal(TeeProductId, group.ProductId);
        Assert.Equal(ProductKind.Garment, group.ProductKind);
        Assert.Equal(PricingModel.GarmentPrint, group.PricingModel);
        Assert.Equal("Staple Tee", group.ProductName);
        Assert.Equal(3, group.TotalQuantity);

        var row = Assert.Single(group.Rows);
        Assert.Equal("Black", row.Colour);
        Assert.Equal("M", row.Size);
        Assert.Equal(3, row.Quantity);
        Assert.Equal(new[] { Id(10) }, row.SourceOrderItemIds);
    }

    [Fact]
    public void One_product_with_multiple_colours_stays_one_group_with_a_row_per_colour()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), "White / M"),
            Garment(Id(11), "Black / M")));

        var group = Assert.Single(groups);
        Assert.Equal(new[] { "Black", "White" }, group.Rows.Select(r => r.Colour));
    }

    [Fact]
    public void One_product_with_multiple_sizes_stays_one_group_ordered_by_apparel_sequence()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), "Black / L"),
            Garment(Id(11), "Black / XS"),
            Garment(Id(12), "Black / M")));

        var group = Assert.Single(groups);
        Assert.Equal(new[] { "XS", "M", "L" }, group.Rows.Select(r => r.Size));
    }

    [Fact]
    public void Multiple_products_produce_separate_groups()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10)),
            Garment(Id(11), productId: TeeTwinProductId, productName: "Heavy Tee")));

        Assert.Equal(2, groups.Count);
        Assert.Equal(new[] { "Heavy Tee", "Staple Tee" }, groups.Select(g => g.ProductName));
    }

    [Fact]
    public void Same_product_name_with_different_product_ids_never_merges()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), productId: TeeProductId, productName: "Staple Tee"),
            Garment(Id(11), productId: TeeTwinProductId, productName: "Staple Tee")));

        Assert.Equal(2, groups.Count);
        Assert.Equal(new[] { TeeProductId, TeeTwinProductId }, groups.Select(g => g.ProductId).OrderBy(id => id.ToString("N")));
        Assert.All(groups, g => Assert.Single(g.Rows));
    }

    [Fact]
    public void Same_product_id_with_disagreeing_name_snapshots_stays_one_group_with_a_deterministic_name()
    {
        var forward = Order(
            Garment(Id(10), productName: "Staple Tee"),
            Garment(Id(11), "Black / L", productName: "Staple Tee (old name)"));
        var reversed = Order(
            Garment(Id(11), "Black / L", productName: "Staple Tee (old name)"),
            Garment(Id(10), productName: "Staple Tee"));

        var a = Assert.Single(OrderProductGroupBuilder.Build(forward));
        var b = Assert.Single(OrderProductGroupBuilder.Build(reversed));

        // Deterministic rule: first non-blank name in source-item id order (Id(10) sorts before Id(11)).
        Assert.Equal("Staple Tee", a.ProductName);
        Assert.Equal(a.ProductName, b.ProductName);
        Assert.Equal(2, a.Rows.Count);
    }

    [Fact]
    public void Blank_product_name_snapshots_are_not_fabricated()
    {
        var group = Assert.Single(OrderProductGroupBuilder.Build(Order(Garment(Id(10), productName: "   "))));

        Assert.Equal("   ", group.ProductName); // preserved verbatim; rendering fallback belongs to 10104
    }

    [Fact]
    public void Same_product_id_with_a_different_kind_or_pricing_model_snapshot_does_not_merge()
    {
        var badgeShaped = Badge(Id(11));
        var sameIdDifferentKind = new OrderItemDto
        {
            Id = Id(11),
            ProductId = TeeProductId, // same product id as the garment below
            ProductName = "Staple Tee",
            Quantity = badgeShaped.Quantity,
            UnitPrice = badgeShaped.UnitPrice,
            ProductKind = ProductKind.Badge,
            PricingModel = PricingModel.QuantityTierUnit,
        };

        var groups = OrderProductGroupBuilder.Build(Order(Garment(Id(10)), sameIdDifferentKind));

        Assert.Equal(2, groups.Count);
        Assert.All(groups, g => Assert.Equal(TeeProductId, g.ProductId));
    }

    // ── Child key: what must stay separate ───────────────────────────────────────

    [Fact]
    public void Same_colour_and_size_with_different_unit_prices_stays_separate_and_never_averages()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), "Black / M", quantity: 2, unitPrice: 30m),
            Garment(Id(11), "Black / M", quantity: 3, unitPrice: 38m)));

        var group = Assert.Single(groups);
        Assert.Equal(2, group.Rows.Count);
        Assert.Equal(new[] { 30m, 38m }, group.Rows.Select(r => r.UnitPrice));
        Assert.Equal(5, group.TotalQuantity);
    }

    [Fact]
    public void Same_colour_and_size_with_different_print_areas_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3") }),
            Garment(Id(11), prints: new[] { Print(Id(1001), BackAreaId, "Back", "BACK", A3SizeId, "A3", "A3") })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_colour_and_size_with_different_print_sizes_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3") }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A4SizeId, "A4", "A4") })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_colour_and_size_with_different_uploaded_artwork_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3",
                uploadedAssetId: Id(600), uploadedAssetUrl: "/uploads/designs/a.png") }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3",
                uploadedAssetId: Id(601), uploadedAssetUrl: "/uploads/designs/b.png") })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_artwork_id_with_a_different_historical_url_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3",
                uploadedAssetUrl: "/uploads/designs/v1.png") }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3",
                uploadedAssetUrl: "/uploads/designs/v2.png") })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_colour_and_size_with_different_design_notes_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", designNote: "Left chest") }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", designNote: "Centred") })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_colour_and_size_with_different_production_notes_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", notes: "Use low heat") }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", notes: null) })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_colour_and_size_with_a_different_print_tier_snapshot_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3",
                resolvedUnitPrintPrice: 8m, appliedPrintTierMinQuantity: 10) }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3",
                resolvedUnitPrintPrice: 8m, appliedPrintTierMinQuantity: 50) })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Same_colour_and_size_with_a_different_resolved_print_price_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), prints: new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", resolvedUnitPrintPrice: 8m) }),
            Garment(Id(11), prints: new[] { Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", resolvedUnitPrintPrice: 6.5m) })));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Different_variant_ids_stay_separate_even_with_the_same_variant_label()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), "Black / M", variantId: Id(500)),
            Garment(Id(11), "Black / M", variantId: Id(501))));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void A_different_quantity_tier_snapshot_stays_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Badge(Id(10), appliedQuantityTierMinQuantity: 25),
            Badge(Id(11), appliedQuantityTierMinQuantity: 100)));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Different_item_level_designs_stay_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Badge(Id(10), designNote: "Club logo"),
            Badge(Id(11), designNote: "Sponsor logo")));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Different_banner_configurations_stay_separate()
    {
        var eyelets = CustomBannerDetail();
        var noEyelets = CustomBannerDetail();
        noEyelets.FinishingEyelets = false;

        var groups = OrderProductGroupBuilder.Build(Order(
            Banner(Id(10), detail: eyelets),
            Banner(Id(11), detail: noEyelets)));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    [Fact]
    public void Different_banner_dimensions_stay_separate()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Banner(Id(10), detail: CustomBannerDetail(width: 1.2m, height: 2.4m)),
            Banner(Id(11), detail: CustomBannerDetail(width: 1.5m, height: 2.4m))));

        Assert.Equal(2, Assert.Single(groups).Rows.Count);
    }

    // ── Child key: what may aggregate ────────────────────────────────────────────

    [Fact]
    public void Exact_child_key_duplicates_aggregate_quantity_and_keep_every_source_id()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), "Black / M", quantity: 2),
            Garment(Id(11), "Black / M", quantity: 3)));

        var row = Assert.Single(Assert.Single(groups).Rows);
        Assert.Equal(5, row.Quantity);
        Assert.Equal(new[] { Id(10), Id(11) }, row.SourceOrderItemIds);
        Assert.Equal(30m, row.UnitPrice);
    }

    [Fact]
    public void The_same_print_set_supplied_in_a_different_array_order_aggregates()
    {
        var front = Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", sortOrder: 0);
        var back = Print(Id(1001), BackAreaId, "Back", "BACK", A4SizeId, "A4", "A4", sortOrder: 1);

        // Same placements, opposite array order, and deliberately different SortOrder values.
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), quantity: 2, prints: new[] { front, back }),
            Garment(Id(11), quantity: 4, prints: new[]
            {
                Print(Id(1002), BackAreaId, "Back", "BACK", A4SizeId, "A4", "A4", sortOrder: 0),
                Print(Id(1003), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3", sortOrder: 1),
            })));

        var row = Assert.Single(Assert.Single(groups).Rows);
        Assert.Equal(6, row.Quantity);
        Assert.Equal(2, row.SourceOrderItemIds.Count);
        // Prints are exposed in deterministic signature order, not in either item's array order.
        Assert.Equal(new[] { FrontAreaId, BackAreaId }, row.Prints.Select(p => p.PrintAreaId));
    }

    [Fact]
    public void Items_with_no_prints_aggregate_with_each_other_only()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), quantity: 2, prints: Array.Empty<OrderItemPrintDto>()),
            Garment(Id(11), quantity: 1, prints: Array.Empty<OrderItemPrintDto>()),
            Garment(Id(12), quantity: 5)));

        var rows = Assert.Single(groups).Rows;
        Assert.Equal(2, rows.Count);
        Assert.Equal(3, rows.Single(r => r.Prints.Count == 0).Quantity);
        Assert.Equal(5, rows.Single(r => r.Prints.Count == 1).Quantity);
    }

    // ── Non-garment kinds and missing data ───────────────────────────────────────

    [Fact]
    public void Badge_rows_carry_no_garment_colour_or_size_and_keep_their_tier_snapshot()
    {
        var group = Assert.Single(OrderProductGroupBuilder.Build(Order(Badge(Id(10), quantity: 25))));

        Assert.Equal(ProductKind.Badge, group.ProductKind);
        var row = Assert.Single(group.Rows);
        Assert.Null(row.Colour);
        Assert.Null(row.Size);
        Assert.Null(row.ProductVariantId);
        Assert.Equal(25, row.AppliedQuantityTierMinQuantity);
        Assert.Equal("Club logo", row.DesignNote);
    }

    [Fact]
    public void FixedSize_banner_rows_keep_their_configuration_snapshot_and_no_apparel_fields()
    {
        var group = Assert.Single(OrderProductGroupBuilder.Build(Order(Banner(Id(10)))));

        Assert.Equal(ProductKind.Banner, group.ProductKind);
        Assert.Equal(PricingModel.FixedSize, group.PricingModel);
        var row = Assert.Single(group.Rows);
        Assert.Null(row.Colour);
        Assert.Null(row.Size);
        Assert.NotNull(row.BannerDetail);
        Assert.Equal(BannerSizeMode.Preset, row.BannerDetail!.SizeMode);
        Assert.Equal("850 x 2000 mm", row.BannerDetail.SizeLabel);
    }

    [Fact]
    public void Custom_banner_dimensions_survive_into_the_projection()
    {
        var group = Assert.Single(OrderProductGroupBuilder.Build(Order(
            Banner(Id(10), detail: CustomBannerDetail()))));

        var detail = Assert.Single(group.Rows).BannerDetail;
        Assert.NotNull(detail);
        Assert.Equal(BannerSizeMode.Custom, detail!.SizeMode);
        Assert.Equal(1.2m, detail.Width);
        Assert.Equal(2.4m, detail.Height);
        Assert.Equal(BannerDimensionUnit.M, detail.Unit);
        Assert.True(detail.FinishingEyelets);
    }

    [Theory]
    [InlineData(null, null, null)]
    [InlineData("", null, null)]
    [InlineData("   ", null, null)]
    // An edge delimiter is removed by the leading trim, so the malformed label survives verbatim as
    // the colour — never repaired, never discarded (see OrderVariantLabelParser).
    [InlineData(" / M", "/ M", null)]
    [InlineData("Black / ", "Black /", null)]
    [InlineData("OneSize", "OneSize", null)]
    [InlineData("Navy / White / XL", "Navy / White", "XL")]
    public void Missing_or_malformed_colour_and_size_are_reported_as_null_never_fabricated(
        string? variantLabel, string? colour, string? size)
    {
        var row = Assert.Single(Assert.Single(OrderProductGroupBuilder.Build(
            Order(Garment(Id(10), variantLabel)))).Rows);

        Assert.Equal(colour, row.Colour);
        Assert.Equal(size, row.Size);
        Assert.Equal(variantLabel, row.VariantLabel); // raw snapshot kept for the 10104 fallback display
    }

    [Fact]
    public void A_deleted_catalogue_product_projects_from_the_snapshot_alone()
    {
        // Nothing but the snapshot exists here: no Product row, no variant row, no print-config row.
        var deletedProductItem = Garment(Id(10), "Black / M", quantity: 2, productName: "Discontinued Tee");

        var group = Assert.Single(OrderProductGroupBuilder.Build(Order(deletedProductItem)));

        Assert.Equal("Discontinued Tee", group.ProductName);
        Assert.Equal("Black", Assert.Single(group.Rows).Colour);
        Assert.Equal(2, group.TotalQuantity);
    }

    [Fact]
    public void An_undefined_product_kind_value_is_ranked_last_rather_than_throwing()
    {
        var odd = Garment(Id(10));
        odd.ProductKind = (ProductKind)99;
        odd.PricingModel = (PricingModel)99;

        var groups = OrderProductGroupBuilder.Build(Order(Garment(Id(11)), odd, Badge(Id(12)), Banner(Id(13))));

        Assert.Equal(4, groups.Count);
        Assert.Equal((ProductKind)99, groups[^1].ProductKind);
    }

    // ── Ordering, purity, determinism ────────────────────────────────────────────

    [Fact]
    public void Groups_are_ordered_by_kind_then_name_then_product_id()
    {
        var groups = OrderProductGroupBuilder.Build(MixedOrder());

        Assert.Equal(
            new[] { ProductKind.Garment, ProductKind.Garment, ProductKind.Badge, ProductKind.Banner },
            groups.Select(g => g.ProductKind));
        // Two garment groups share the name "Staple Tee"; ProductId breaks the tie deterministically.
        Assert.Equal(
            new[] { TeeProductId, TeeTwinProductId },
            groups.Where(g => g.ProductKind == ProductKind.Garment).Select(g => g.ProductId));
    }

    [Fact]
    public void Rows_are_ordered_by_colour_then_size_rank_with_missing_values_last()
    {
        var groups = OrderProductGroupBuilder.Build(Order(
            Garment(Id(10), "White / L"),
            Garment(Id(11), null),
            Garment(Id(12), "Black / XL"),
            Garment(Id(13), "Black / S"),
            Garment(Id(14), "black / M")));

        // Colour groups adjacent case-insensitively, then splits deterministically by ordinal ("Black"
        // before "black"); size rank orders within one exact colour; a missing colour sorts last.
        var rows = Assert.Single(groups).Rows;
        Assert.Equal(new[] { "Black", "Black", "black", "White", null }, rows.Select(r => r.Colour));
        Assert.Equal(new[] { "S", "XL", "M", "L", null }, rows.Select(r => r.Size));
    }

    [Fact]
    public void Shuffled_input_produces_a_deeply_equal_projection()
    {
        var items = MixedOrder().Items.ToList();
        var forward = OrderProductGroupBuilder.Build(Order(items.ToArray()));
        var reversed = OrderProductGroupBuilder.Build(Order(items.AsEnumerable().Reverse().ToArray()));
        var rotated = OrderProductGroupBuilder.Build(Order(items.Skip(2).Concat(items.Take(2)).ToArray()));

        Assert.Equal(Serialize(forward), Serialize(reversed));
        Assert.Equal(Serialize(forward), Serialize(rotated));
    }

    [Fact]
    public void Building_twice_produces_identical_output()
    {
        var order = MixedOrder();

        Assert.Equal(Serialize(OrderProductGroupBuilder.Build(order)), Serialize(OrderProductGroupBuilder.Build(order)));
    }

    [Fact]
    public void The_input_order_and_its_nested_collections_are_never_mutated()
    {
        var order = MixedOrder();
        var before = Serialize(order);
        var itemOrder = order.Items.Select(i => i.Id).ToList();
        var printOrder = order.Items.SelectMany(i => i.Prints.Select(p => p.Id)).ToList();

        OrderProductGroupBuilder.Build(order);

        Assert.Equal(before, Serialize(order));
        Assert.Equal(itemOrder, order.Items.Select(i => i.Id));
        Assert.Equal(printOrder, order.Items.SelectMany(i => i.Prints.Select(p => p.Id)));
    }

    // ── Reconciliation invariants ────────────────────────────────────────────────

    [Fact]
    public void Group_quantity_equals_the_sum_of_its_row_quantities()
    {
        foreach (var group in OrderProductGroupBuilder.Build(ReconciliationOrder()))
            Assert.Equal(group.TotalQuantity, group.Rows.Sum(r => r.Quantity));
    }

    [Fact]
    public void Total_grouped_quantity_equals_the_original_order_quantity()
    {
        var order = ReconciliationOrder();

        var grouped = OrderProductGroupBuilder.Build(order).Sum(g => g.TotalQuantity);

        Assert.Equal(order.Items.Sum(i => i.Quantity), grouped);
        Assert.Equal(24, grouped);
    }

    [Fact]
    public void Every_source_item_id_appears_exactly_once_across_the_whole_projection()
    {
        var order = ReconciliationOrder();

        var sourceIds = OrderProductGroupBuilder.Build(order)
            .SelectMany(g => g.Rows)
            .SelectMany(r => r.SourceOrderItemIds)
            .ToList();

        Assert.Equal(sourceIds.Count, sourceIds.Distinct().Count());          // no duplicates
        Assert.Equal(
            order.Items.Select(i => i.Id).OrderBy(id => id).ToList(),
            sourceIds.OrderBy(id => id).ToList());                            // nothing lost, nothing invented
    }

    [Fact]
    public void Every_row_keeps_at_least_one_source_id_and_lands_in_its_own_product_group()
    {
        var order = ReconciliationOrder();
        var itemsById = order.Items.ToDictionary(i => i.Id);

        foreach (var group in OrderProductGroupBuilder.Build(order))
        {
            foreach (var row in group.Rows)
            {
                Assert.NotEmpty(row.SourceOrderItemIds);
                foreach (var id in row.SourceOrderItemIds)
                {
                    Assert.Equal(group.ProductId, itemsById[id].ProductId);
                    Assert.Equal(group.ProductKind, itemsById[id].ProductKind);
                    Assert.Equal(row.UnitPrice, itemsById[id].UnitPrice); // never averaged, never repriced
                }
            }
        }
    }

    [Fact]
    public void Row_quantity_equals_the_sum_of_its_own_source_items()
    {
        var order = ReconciliationOrder();
        var itemsById = order.Items.ToDictionary(i => i.Id);

        foreach (var row in OrderProductGroupBuilder.Build(order).SelectMany(g => g.Rows))
            Assert.Equal(row.SourceOrderItemIds.Sum(id => itemsById[id].Quantity), row.Quantity);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    /// <summary>Mixed order with duplicates, distinct prices, several kinds and a same-name twin product.</summary>
    private static OrderDto ReconciliationOrder() => Order(
        Garment(Id(10), "Black / M", quantity: 3),
        Garment(Id(11), "Black / M", quantity: 2),                       // exact duplicate -> aggregates
        Garment(Id(12), "Black / M", quantity: 1, unitPrice: 35m),       // different price -> separate
        Garment(Id(13), "White / L", quantity: 4),
        Garment(Id(14), "Navy / XL", quantity: 5, productId: TeeTwinProductId, productName: "Staple Tee"),
        Badge(Id(15), quantity: 7),
        Banner(Id(16), quantity: 2));

    private static string Serialize(object value)
        => JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = false });
}
