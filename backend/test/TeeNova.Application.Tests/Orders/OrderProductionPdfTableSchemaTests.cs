using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Jira 10105 — the child-table schema after the two visual checklist columns were removed.
///
/// <c>OrderProductionPdfService.ChildTableColumns</c> is the single source of BOTH the QuestPDF column
/// definition and the header row, so asserting it asserts the rendered table: a column that is not in
/// this list cannot be defined, and a header that is not in this list cannot be printed.
/// </summary>
public sealed class OrderProductionPdfTableSchemaTests
{
    private const string ClothesFindedHeader = "Clothes Finded";
    private const string FinishedHeader = "Finished";

    private static IReadOnlyList<ProductionPdfChildColumn> Schema(ProductionPdfRowLayout layout)
        => OrderProductionPdfService.ChildTableColumns(layout);

    private static ProductionPdfProductSection SectionFor(OrderDto order)
        => Assert.Single(OrderProductionPdfModelBuilder.Build(order).Sections);

    // ── Layout schema ───────────────────────────────────────────────────────────

    [Fact]
    public void The_garment_table_has_exactly_four_useful_columns()
        => Assert.Equal(
            new[] { "Colour", "Size", "Qty", "Production details" },
            Schema(ProductionPdfRowLayout.GarmentVariant).Select(c => c.Header).ToArray());

    [Fact]
    public void The_compact_table_has_exactly_two_useful_columns()
        => Assert.Equal(
            new[] { "Qty", "Design / production details" },
            Schema(ProductionPdfRowLayout.CompactDesign).Select(c => c.Header).ToArray());

    [Fact]
    public void A_single_row_garment_product_uses_the_four_column_schema()
    {
        var section = SectionFor(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3)));

        Assert.Equal(ProductionPdfRowLayout.GarmentVariant, section.Layout);
        Assert.Equal(4, Schema(section.Layout).Count);
    }

    [Fact]
    public void A_multi_row_garment_table_still_has_no_checklist_columns()
    {
        var section = SectionFor(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / L", quantity: 2,
                variantId: OrderProjectionFixtures.Id(501)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(12), "White / M", quantity: 4,
                variantId: OrderProjectionFixtures.Id(502))));

        Assert.Equal(3, section.Rows.Count);
        AssertNoChecklistColumns(Schema(section.Layout));
    }

    [Theory]
    [InlineData(ProductKind.Badge)]
    [InlineData(ProductKind.Banner)]
    [InlineData(ProductKind.Other)]
    [InlineData((ProductKind)999)]
    public void Every_non_garment_kind_uses_the_two_column_compact_schema(ProductKind kind)
    {
        var section = SectionFor(OrderProjectionFixtures.Order(NonGarmentItem(kind)));

        Assert.Equal(ProductionPdfRowLayout.CompactDesign, section.Layout);
        Assert.Equal(2, Schema(section.Layout).Count);
        AssertNoChecklistColumns(Schema(section.Layout));
    }

    [Fact]
    public void A_fixed_size_and_a_custom_dimension_banner_both_use_the_compact_schema()
    {
        foreach (var detail in new[] { OrderProjectionFixtures.PresetBannerDetail(), OrderProjectionFixtures.CustomBannerDetail() })
        {
            var section = SectionFor(OrderProjectionFixtures.Order(
                OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20), detail: detail)));

            Assert.Equal(ProductionPdfRowLayout.CompactDesign, section.Layout);
            AssertNoChecklistColumns(Schema(section.Layout));
        }
    }

    [Fact]
    public void No_layout_declares_a_checklist_header_or_an_unlabelled_column()
    {
        foreach (ProductionPdfRowLayout layout in Enum.GetValues<ProductionPdfRowLayout>())
        {
            var schema = Schema(layout);

            AssertNoChecklistColumns(schema);
            Assert.NotEmpty(schema);

            foreach (var column in schema)
            {
                // No spacer, no unlabelled narrow column, no zero-width definition.
                Assert.False(string.IsNullOrWhiteSpace(column.Header));
                Assert.True(
                    column.ConstantWidth > 0f ^ column.RelativeWidth > 0f,
                    $"Column '{column.Header}' must be either fixed or flexible with a real width.");
            }
        }
    }

    [Fact]
    public void The_production_service_no_longer_declares_a_checkbox_cell_helper()
    {
        // The helper existed only to draw the checklist squares. The frozen baseline keeps its own copy.
        var members = typeof(OrderProductionPdfService)
            .GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Select(m => m.Name)
            .ToList();

        Assert.DoesNotContain("CheckBoxCell", members);
        Assert.DoesNotContain(members, name => name.Contains("Checklist", StringComparison.OrdinalIgnoreCase));
    }

    // ── Column-width rebalancing ────────────────────────────────────────────────

    [Fact]
    public void The_production_detail_column_takes_the_majority_of_the_reclaimed_garment_width()
    {
        var schema = Schema(ProductionPdfRowLayout.GarmentVariant);

        var colour = schema.Single(c => c.Header == "Colour");
        var details = schema.Single(c => c.Header == "Production details");

        // Before 10105 the flexible weights were colour 2.2, details 4.4, checklist 1.6 + 1.4.
        const float colourBefore = 2.2f, detailsBefore = 4.4f, checklistBefore = 1.6f + 1.4f;
        const float flexibleTotalBefore = colourBefore + detailsBefore + checklistBefore;

        var flexibleTotalAfter = schema.Where(c => c.RelativeWidth > 0f).Sum(c => c.RelativeWidth);

        var colourShareGain = colour.RelativeWidth / flexibleTotalAfter - colourBefore / flexibleTotalBefore;
        var detailsShareGain = details.RelativeWidth / flexibleTotalAfter - detailsBefore / flexibleTotalBefore;

        Assert.True(detailsShareGain > 0f, "Production details must gain width.");
        Assert.True(colourShareGain > 0f, "Colour must stay readable and may gain a little width.");
        Assert.True(
            detailsShareGain > colourShareGain * 2f,
            $"Details gained {detailsShareGain:P1} vs colour {colourShareGain:P1}; details must take the majority.");
    }

    [Fact]
    public void The_compact_detail_column_consumes_all_width_left_by_the_quantity_column()
    {
        var schema = Schema(ProductionPdfRowLayout.CompactDesign);

        var flexible = schema.Where(c => c.RelativeWidth > 0f).ToList();

        Assert.Single(flexible);
        Assert.Equal("Design / production details", flexible[0].Header);
        Assert.Equal("Qty", Assert.Single(schema, c => c.ConstantWidth > 0f).Header);
    }

    [Fact]
    public void Quantity_stays_compact_and_right_aligned_in_both_layouts()
    {
        foreach (ProductionPdfRowLayout layout in Enum.GetValues<ProductionPdfRowLayout>())
        {
            var qty = Schema(layout).Single(c => c.Header == "Qty");

            Assert.True(qty.AlignRight);
            Assert.Equal(35f, qty.ConstantWidth);
        }

        // Only Qty is right-aligned; nothing else was centred (the checklist headers were).
        foreach (ProductionPdfRowLayout layout in Enum.GetValues<ProductionPdfRowLayout>())
            Assert.Equal("Qty", Assert.Single(Schema(layout), c => c.AlignRight).Header);
    }

    [Fact]
    public void Size_remains_a_readable_fixed_column_in_the_garment_layout()
    {
        var size = Schema(ProductionPdfRowLayout.GarmentVariant).Single(c => c.Header == "Size");

        Assert.True(size.ConstantWidth >= 46f, "Size must fit values such as 'One Size' and 'XXXXXL'.");
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private static void AssertNoChecklistColumns(IReadOnlyList<ProductionPdfChildColumn> schema)
    {
        Assert.DoesNotContain(schema, c => c.Header == ClothesFindedHeader);
        Assert.DoesNotContain(schema, c => c.Header == FinishedHeader);
        Assert.DoesNotContain(schema, c => c.Header.Contains("Finded", StringComparison.OrdinalIgnoreCase));
    }

    private static OrderItemDto NonGarmentItem(ProductKind kind) => kind switch
    {
        ProductKind.Badge => OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21)),
        ProductKind.Banner => OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20)),
        _ => OtherKindItem(kind),
    };

    private static OrderItemDto OtherKindItem(ProductKind kind) => new()
    {
        Id = OrderProjectionFixtures.Id(22),
        ProductId = OrderProjectionFixtures.Id(7),
        ProductName = "Sticker Sheet",
        Quantity = 12,
        UnitPrice = 4m,
        PricingModel = PricingModel.QuantityTierUnit,
        ProductKind = kind,
        UploadedAssetUrl = "/uploads/designs/sticker_20260701_aaa111_sheet.png",
    };
}
