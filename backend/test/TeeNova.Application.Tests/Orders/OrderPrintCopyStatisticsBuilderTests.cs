using System;
using System.Linq;
using System.Text.Json;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>Jira 10106 — pure projection, identity, normalisation and reconciliation coverage.</summary>
public sealed class OrderPrintCopyStatisticsBuilderTests
{
    [Fact]
    public void Empty_order_has_no_copies_groups_or_size_totals()
    {
        var statistics = Build(OrderProjectionFixtures.Order());

        Assert.Equal(0, statistics.TotalPrintCopies);
        Assert.Empty(statistics.SizeTotals);
        Assert.Empty(statistics.DetailedGroups);
    }

    [Fact]
    public void Garment_without_prints_contributes_zero_and_creates_no_unspecified_statistic()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(Id(10), quantity: 8, prints: Array.Empty<OrderItemPrintDto>())));

        Assert.Equal(0, statistics.TotalPrintCopies);
        Assert.Empty(statistics.SizeTotals);
        Assert.Empty(statistics.DetailedGroups);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(7)]
    public void One_membership_contributes_the_ordered_item_quantity(int quantity)
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(Id(10), quantity: quantity)));

        Assert.Equal(quantity, statistics.TotalPrintCopies);
        Assert.Equal(quantity, Assert.Single(statistics.SizeTotals).CopyCount);
        Assert.Equal(quantity, Assert.Single(statistics.DetailedGroups).CopyCount);
    }

    [Fact]
    public void Same_exact_group_across_colours_and_sizes_sums_quantities_not_rows()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 3, Print(Id(1001))),
            Garment(Id(11), "Black / L", 2, Print(Id(1002))),
            Garment(Id(12), "White / M", 4, Print(Id(1003)))));

        var group = Assert.Single(statistics.DetailedGroups);
        Assert.Equal(9, group.CopyCount);
        Assert.Equal(9, statistics.TotalPrintCopies);
        Assert.Equal(3, group.SourceOrderItemIds.Count);
        Assert.Equal(3, group.SourceOrderItemPrintIds.Count);
    }

    [Fact]
    public void Worked_example_a3_five_and_a4_four_reconciles_to_nine()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 3, Print(Id(1001), sizeId: Id(201), sizeName: "A3")),
            Garment(Id(11), "Black / L", 2, Print(Id(1002), sizeId: Id(201), sizeName: "A3")),
            Garment(Id(12), "White / M", 4, Print(Id(1003), sizeId: Id(202), sizeName: "A4"))));

        Assert.Equal(new[] { ("A4", 4), ("A3", 5) },
            statistics.SizeTotals.Select(total => (total.DisplayLabel, total.CopyCount)).ToArray());
        Assert.Equal(9, statistics.TotalPrintCopies);
    }

    [Fact]
    public void One_item_front_a4_and_back_a3_contributes_six_physical_prints()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(Id(10), quantity: 3, prints: new[]
            {
                Print(Id(1001), areaId: Id(101), areaName: "Front", sizeId: Id(202), sizeName: "A4"),
                Print(Id(1002), areaId: Id(102), areaName: "Back", sizeId: Id(201), sizeName: "A3"),
            })));

        Assert.Equal(6, statistics.TotalPrintCopies);
        Assert.Equal(2, statistics.DetailedGroups.Count);
        Assert.All(statistics.DetailedGroups, group => Assert.Equal(3, group.CopyCount));
    }

    [Fact]
    public void Front_and_back_a3_each_contribute_full_quantity_to_one_size_total()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(Id(10), quantity: 5, prints: new[]
            {
                Print(Id(1001), areaId: Id(101), areaName: "Front", sizeId: Id(201), sizeName: "A3"),
                Print(Id(1002), areaId: Id(102), areaName: "Back", sizeId: Id(201), sizeName: "A3"),
            })));

        Assert.Equal(10, Assert.Single(statistics.SizeTotals).CopyCount);
        Assert.Equal(10, statistics.TotalPrintCopies);
        Assert.Equal(2, statistics.DetailedGroups.Count);
        Assert.All(statistics.DetailedGroups, group => Assert.Equal(5, group.CopyCount));
    }

    [Fact]
    public void Every_source_print_membership_appears_once_and_all_totals_reconcile()
    {
        var order = OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 3,
                Print(Id(1001), areaId: Id(101), areaName: "Front", sizeId: Id(201), sizeName: "A3"),
                Print(Id(1002), areaId: Id(102), areaName: "Back", sizeId: Id(202), sizeName: "A4")),
            Garment(Id(11), "White / L", 4,
                Print(Id(1003), areaId: Id(101), areaName: "Front", sizeId: Id(201), sizeName: "A3")));

        var statistics = Build(order);
        var expectedPrintIds = order.Items.SelectMany(item => item.Prints).Select(print => print.Id).Order().ToArray();
        var actualPrintIds = statistics.DetailedGroups.SelectMany(group => group.SourceOrderItemPrintIds).Order().ToArray();

        Assert.Equal(expectedPrintIds, actualPrintIds);
        Assert.Equal(actualPrintIds.Length, actualPrintIds.Distinct().Count());
        Assert.Equal(statistics.TotalPrintCopies, statistics.SizeTotals.Sum(total => total.CopyCount));
        Assert.Equal(statistics.TotalPrintCopies, statistics.DetailedGroups.Sum(group => group.CopyCount));
        Assert.Equal(order.Items.Sum(item => item.Quantity * item.Prints.Count), statistics.TotalPrintCopies);
        Assert.All(statistics.DetailedGroups, group =>
            Assert.Equal(group.Memberships.Sum(membership => membership.Quantity), group.CopyCount));
    }

    [Fact]
    public void Exact_duplicate_product_rows_still_count_each_source_membership_quantity()
    {
        var order = OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 3, Print(Id(1001))),
            Garment(Id(11), "Black / M", 4, Print(Id(1002))));

        Assert.Equal(7, Assert.Single(OrderProductGroupBuilder.Build(order)).TotalQuantity);
        Assert.Equal(7, Assert.Single(Build(order).DetailedGroups).CopyCount);
    }

    [Fact]
    public void Input_item_and_print_array_order_do_not_change_the_projection()
    {
        var first = Garment(Id(10), "Black / M", 3,
            Print(Id(1001), areaId: Id(101), areaName: "Front", sizeId: Id(201), sizeName: "A3"),
            Print(Id(1002), areaId: Id(102), areaName: "Back", sizeId: Id(202), sizeName: "A4"));
        var second = Garment(Id(11), "White / L", 4,
            Print(Id(1003), areaId: Id(101), areaName: "Front", sizeId: Id(201), sizeName: "A3"));

        var forward = Flatten(Build(OrderProjectionFixtures.Order(first, second)));
        first.Prints.Reverse();
        var reversed = Flatten(Build(OrderProjectionFixtures.Order(second, first)));

        Assert.Equal(forward, reversed);
    }

    [Fact]
    public void Builder_does_not_mutate_the_snapshot()
    {
        var order = OrderProjectionFixtures.MixedOrder();
        var before = JsonSerializer.Serialize(order);

        _ = Build(order);

        Assert.Equal(before, JsonSerializer.Serialize(order));
    }

    [Fact]
    public void Different_asset_ids_with_the_same_filename_remain_exactly_separate_and_are_disambiguated()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 2, Print(Id(1001), assetId: Id(301), url: "/one/logo.png")),
            Garment(Id(11), "White / L", 3, Print(Id(1002), assetId: Id(302), url: "/two/logo.png"))));

        Assert.Equal(2, statistics.DetailedGroups.Count);
        Assert.Equal(2, statistics.DetailedGroups.Select(group => group.DesignKey).Distinct().Count());
        Assert.All(statistics.DetailedGroups, group => Assert.Contains("Design ", group.DesignLabel));
        Assert.Equal(new[] { 2, 3 }, statistics.DetailedGroups.Select(group => group.CopyCount).Order().ToArray());
    }

    [Fact]
    public void Same_asset_url_with_different_design_notes_remains_separate()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 2, Print(Id(1001), url: "/designs/logo.png", note: "Crest")),
            Garment(Id(11), "White / L", 3, Print(Id(1002), url: "/designs/logo.png", note: "Sponsor"))));

        Assert.Equal(2, statistics.DetailedGroups.Count);
        Assert.Contains(statistics.DetailedGroups, group => group.DesignLabel == "logo.png — Crest");
        Assert.Contains(statistics.DetailedGroups, group => group.DesignLabel == "logo.png — Sponsor");
    }

    [Fact]
    public void Historical_url_only_and_no_design_records_remain_traceable()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 2, Print(Id(1001), url: "/archive/logo.png")),
            Garment(Id(11), "White / L", 3, Print(Id(1002), note: "Print text only"))));

        Assert.Contains(statistics.DetailedGroups, group => group.DesignLabel == "logo.png");
        Assert.Contains(statistics.DetailedGroups, group => group.DesignLabel == "No design uploaded — Print text only");
        Assert.Equal(new[] { Id(1001), Id(1002) },
            statistics.DetailedGroups.SelectMany(group => group.SourceOrderItemPrintIds).Order().ToArray());
    }

    [Fact]
    public void Different_area_and_size_ids_never_merge_even_when_labels_match()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 2,
                Print(Id(1001), areaId: Id(101), areaName: "Front", areaCode: "", sizeId: Id(201), sizeName: "A3", sizeCode: ""),
                Print(Id(1002), areaId: Id(102), areaName: "Front", areaCode: "", sizeId: Id(202), sizeName: "A3", sizeCode: ""))));

        Assert.Equal(2, statistics.DetailedGroups.Count);
        Assert.Equal(2, statistics.DetailedGroups.Select(group => group.PrintAreaId).Distinct().Count());
        Assert.Equal(2, statistics.DetailedGroups.Select(group => group.PrintSizeId).Distinct().Count());
        Assert.All(statistics.DetailedGroups, group => Assert.Contains("Position ", group.PrintAreaLabel));
        Assert.All(statistics.DetailedGroups, group => Assert.Contains("Size ", group.PrintSizeLabel));
    }

    [Fact]
    public void Blank_area_size_and_design_use_controlled_labels_without_dropping_the_membership()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 4,
                Print(Id(1001), areaName: "  ", areaCode: "", sizeName: "\t", sizeCode: "", url: null))));

        var group = Assert.Single(statistics.DetailedGroups);
        Assert.Equal("No design uploaded", group.DesignLabel);
        Assert.Equal("Unspecified position", group.PrintAreaLabel);
        Assert.Equal("Unspecified size", group.PrintSizeLabel);
        Assert.Equal("Unspecified size", Assert.Single(statistics.SizeTotals).DisplayLabel);
        Assert.Equal(4, statistics.TotalPrintCopies);
    }

    [Fact]
    public void A3_case_and_spacing_variants_roll_up_but_exact_size_ids_remain_separate()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 2, Print(Id(1001), sizeId: Id(201), sizeName: "A3")),
            Garment(Id(11), "Black / L", 3, Print(Id(1002), sizeId: Id(202), sizeName: "a3")),
            Garment(Id(12), "White / M", 4, Print(Id(1003), sizeId: Id(203), sizeName: " a  3 "))));

        var total = Assert.Single(statistics.SizeTotals);
        Assert.Equal("A3", total.DisplayLabel);
        Assert.Equal(9, total.CopyCount);
        Assert.Equal(new[] { Id(201), Id(202), Id(203) }, total.SourcePrintSizeIds);
        Assert.True(total.CombinesMultipleSizeRecords);
        Assert.Equal(3, statistics.DetailedGroups.Count);
        Assert.Equal(3, statistics.DetailedGroups.Select(group => group.PrintSizeId).Distinct().Count());
    }

    [Fact]
    public void A3_plus_and_custom_sizes_do_not_merge_with_standard_a3()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 1, Print(Id(1001), sizeId: Id(201), sizeName: "A3")),
            Garment(Id(11), "Black / L", 2, Print(Id(1002), sizeId: Id(202), sizeName: "A3+")),
            Garment(Id(12), "White / M", 3, Print(Id(1003), sizeId: Id(203), sizeName: "Custom A3"))));

        Assert.Equal(3, statistics.SizeTotals.Count);
        Assert.Equal(new[] { "A3", "A3+", "Custom A3" },
            statistics.SizeTotals.Select(total => total.DisplayLabel).ToArray());
    }

    [Fact]
    public void Custom_records_with_the_same_visible_label_stay_traceable_and_disambiguated()
    {
        var statistics = Build(OrderProjectionFixtures.Order(
            Garment(Id(10), "Black / M", 2, Print(Id(1001), sizeId: Id(211), sizeName: "  Screen   40cm ")),
            Garment(Id(11), "Black / L", 3, Print(Id(1002), sizeId: Id(212), sizeName: "Screen 40cm"))));

        Assert.Equal(2, statistics.SizeTotals.Count);
        Assert.All(statistics.SizeTotals, total => Assert.Contains("Size ", total.DisplayLabel));
        Assert.Equal(new[] { Id(211), Id(212) },
            statistics.SizeTotals.SelectMany(total => total.SourcePrintSizeIds).Order().ToArray());
    }

    [Fact]
    public void Standard_custom_and_unspecified_size_order_is_deterministic()
    {
        var names = new[] { "Unspecified", "Custom Z", "A0", "A3", "Custom A", "A10", "A4" };
        var prints = names.Select((name, index) => Print(
            Id(1001 + index),
            sizeId: Id(201 + index),
            sizeName: name == "Unspecified" ? " " : name,
            sizeCode: "")).ToArray();
        var statistics = Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(Id(10), quantity: 1, prints: prints)));

        Assert.Equal(new[] { "A10", "A4", "A3", "A0", "Custom A", "Custom Z", "Unspecified size" },
            statistics.SizeTotals.Select(total => total.DisplayLabel).ToArray());
    }

    [Theory]
    [InlineData(ProductKind.Badge)]
    [InlineData(ProductKind.Banner)]
    [InlineData(ProductKind.Other)]
    public void Non_garment_items_contribute_zero_even_if_malformed_data_contains_a_print(ProductKind kind)
    {
        var item = kind switch
        {
            ProductKind.Badge => OrderProjectionFixtures.Badge(Id(10)),
            ProductKind.Banner => OrderProjectionFixtures.Banner(Id(10)),
            _ => new OrderItemDto
            {
                Id = Id(10),
                ProductId = Id(20),
                ProductName = "Other",
                Quantity = 9,
                ProductKind = ProductKind.Other,
                PricingModel = PricingModel.QuantityTierUnit,
            },
        };
        item.Prints.Add(Print(Id(1001)));

        var statistics = Build(OrderProjectionFixtures.Order(item));

        Assert.Equal(0, statistics.TotalPrintCopies);
        Assert.Empty(statistics.SizeTotals);
        Assert.Empty(statistics.DetailedGroups);
    }

    private static OrderPrintCopyStatistics Build(OrderDto order)
        => OrderPrintCopyStatisticsBuilder.Build(order);

    private static Guid Id(int value) => OrderProjectionFixtures.Id(value);

    private static OrderItemDto Garment(
        Guid id,
        string variant,
        int quantity,
        params OrderItemPrintDto[] prints)
        => OrderProjectionFixtures.Garment(id, variant, quantity, prints: prints);

    private static OrderItemPrintDto Print(
        Guid id,
        Guid? areaId = null,
        string areaName = "Front",
        string areaCode = "FRONT",
        Guid? sizeId = null,
        string sizeName = "A3",
        string sizeCode = "A3",
        Guid? assetId = null,
        string? url = null,
        string? note = null)
        => OrderProjectionFixtures.Print(
            id,
            areaId ?? Id(101),
            areaName,
            areaCode,
            sizeId ?? Id(201),
            sizeName,
            sizeCode,
            uploadedAssetId: assetId,
            uploadedAssetUrl: url,
            designNote: note);

    private static string Flatten(OrderPrintCopyStatistics statistics)
        => JsonSerializer.Serialize(statistics);
}
