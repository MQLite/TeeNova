using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Jira 10104 — structural tests for the product-grouped production sheet, asserted against the pure
/// <see cref="ProductionPdfItemsModel"/> that the PDF service renders rather than against compressed PDF
/// bytes. The repository has no PDF text-extraction tooling, so this model IS the testable layout:
/// <c>OrderProductionPdfService.ComposeItems</c> calls <see cref="OrderProductionPdfModelBuilder.Build"/>
/// and prints nothing that is not in the returned model.
/// </summary>
public sealed class OrderProductionPdfCompositionTests
{
    private static ProductionPdfItemsModel Build(OrderDto order) => OrderProductionPdfModelBuilder.Build(order);

    private static ProductionPdfProductSection Single(OrderDto order) => Assert.Single(Build(order).Sections);

    // ── 1. Projection consumption ───────────────────────────────────────────────

    [Fact]
    public void The_rendering_model_is_built_from_the_product_group_projection_one_section_per_group()
    {
        var order = OrderProjectionFixtures.MixedOrder();

        var groups = OrderProductGroupBuilder.Build(order);
        var model = Build(order);

        // Same count, same order, same identity and same quantities — the model is the projection.
        Assert.Equal(groups.Count, model.Sections.Count);
        Assert.Equal(
            groups.Select(g => g.GroupKey).ToList(),
            model.Sections.Select(s => s.GroupKey).ToList());
        Assert.Equal(
            groups.Select(g => (g.ProductId, g.ProductKind, g.TotalQuantity)).ToList(),
            model.Sections.Select(s => (s.ProductId, s.ProductKind, s.TotalQuantity)).ToList());

        for (var i = 0; i < groups.Count; i++)
        {
            Assert.Equal(groups[i].Rows.Count, model.Sections[i].Rows.Count);
            Assert.Equal(
                groups[i].Rows.Select(r => r.Quantity).ToList(),
                model.Sections[i].Rows.Select(r => r.Quantity).ToList());
        }
    }

    [Fact]
    public void The_model_builder_uses_the_builders_own_group_output_without_re_sorting_or_regrouping()
    {
        var order = OrderProjectionFixtures.MixedOrder();

        var fromOrder = Build(order);
        var fromGroups = OrderProductionPdfModelBuilder.FromGroups(OrderProductGroupBuilder.Build(order));

        Assert.Equal(Flatten(fromGroups), Flatten(fromOrder));

        // Building twice is stable: the layout depends only on the snapshot.
        Assert.Equal(Flatten(fromOrder), Flatten(Build(order)));
    }

    /// <summary>A stable, fully structural text rendering of the model, used for deep comparisons.</summary>
    internal static string Flatten(ProductionPdfItemsModel model)
        => string.Join("\n", model.Sections.Select(s =>
            $"[{s.GroupKey}|{s.ProductName}|{s.ProductKind}|{s.KindLabel}|{s.TotalQuantity}|{s.Layout}]\n" +
            string.Join("\n", s.Rows.Select(r =>
                $"  {r.Colour}|{r.Size}|{r.Quantity}|{string.Join(" ¶ ", r.ProductionLines)}"))));

    // ── 2. Product-block composition ────────────────────────────────────────────

    [Fact]
    public void Empty_order_produces_no_product_sections_and_a_zero_total()
    {
        var model = Build(OrderProjectionFixtures.Order());

        Assert.Empty(model.Sections);
        Assert.Equal(0, model.ProductCount);
        Assert.Equal(0, model.TotalQuantity);
    }

    [Fact]
    public void One_garment_product_with_one_row()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3)));

        Assert.Equal("Staple Tee", section.ProductName);
        Assert.Equal(ProductKind.Garment, section.ProductKind);
        Assert.Null(section.KindLabel); // garment kind needs no clarifying label
        Assert.Equal(ProductionPdfRowLayout.GarmentVariant, section.Layout);
        Assert.Equal(3, section.TotalQuantity);

        var row = Assert.Single(section.Rows);
        Assert.Equal("Black", row.Colour);
        Assert.Equal("M", row.Size);
        Assert.Equal(3, row.Quantity);
        Assert.Equal(new[] { "Front A3" }, row.ProductionLines);
    }

    [Fact]
    public void One_garment_product_with_multiple_colours_stays_one_section()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "White / M", quantity: 2, variantId: OrderProjectionFixtures.Id(501))));

        Assert.Equal(2, section.Rows.Count);
        Assert.Equal(new[] { "Black", "White" }, section.Rows.Select(r => r.Colour).ToArray());
        Assert.Equal(5, section.TotalQuantity);
    }

    [Fact]
    public void One_garment_product_with_multiple_sizes_stays_one_section_in_apparel_order()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(12), "Black / XL", quantity: 1, variantId: OrderProjectionFixtures.Id(503)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / S", quantity: 3, variantId: OrderProjectionFixtures.Id(501)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 2, variantId: OrderProjectionFixtures.Id(502))));

        Assert.Equal(new[] { "S", "M", "XL" }, section.Rows.Select(r => r.Size).ToArray());
        Assert.Equal(6, section.TotalQuantity);
    }

    [Fact]
    public void Multiple_products_produce_multiple_sections()
    {
        var model = Build(OrderProjectionFixtures.MixedOrder());

        // Staple Tee (x2 distinct product ids), Round Badge, Pull-up Banner.
        Assert.Equal(4, model.Sections.Count);
        Assert.Equal(4, model.ProductCount);
    }

    [Fact]
    public void Same_product_name_with_different_product_ids_produces_two_product_sections()
    {
        var model = Build(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 4,
                productId: OrderProjectionFixtures.TeeTwinProductId, productName: "Staple Tee",
                variantId: OrderProjectionFixtures.Id(501))));

        Assert.Equal(2, model.Sections.Count);
        Assert.All(model.Sections, s => Assert.Equal("Staple Tee", s.ProductName));
        Assert.Equal(2, model.Sections.Select(s => s.ProductId).Distinct().Count());
        Assert.Equal(7, model.TotalQuantity);
    }

    [Fact]
    public void Exact_duplicate_source_items_appear_as_one_row_with_summed_quantity()
    {
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 4));

        var section = Single(order);
        var row = Assert.Single(section.Rows);

        Assert.Equal(7, row.Quantity);
        Assert.Equal(7, section.TotalQuantity);
        Assert.Equal(2, row.SourceOrderItemIds.Count); // aggregated, but both ids retained
    }

    [Fact]
    public void The_displayed_quantity_is_never_the_number_of_source_items()
    {
        // Two items of quantity 3 and 4 aggregate to 7 — not to 2.
        var row = Assert.Single(Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 4))).Rows);

        Assert.Equal(7, row.Quantity);
        Assert.NotEqual(row.SourceOrderItemIds.Count, row.Quantity);
    }

    [Fact]
    public void Print_placements_never_multiply_the_garment_quantity()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 5, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.BackAreaId, "Back", "BACK", OrderProjectionFixtures.A4SizeId, "A4", "A4"),
            })));

        var row = Assert.Single(section.Rows);
        Assert.Equal(5, row.Quantity);
        Assert.Equal(5, section.TotalQuantity);
        Assert.Equal(new[] { "Front A3", "Back A4" }, row.ProductionLines);
    }

    // ── 3. Production-distinct rows never collapse ──────────────────────────────

    [Fact]
    public void Same_colour_and_size_with_different_print_areas_stays_two_rows_with_distinguishing_detail()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.BackAreaId, "Back", "BACK", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
            })));

        Assert.Equal(2, section.Rows.Count);
        Assert.All(section.Rows, r => Assert.Equal("Black", r.Colour));
        Assert.All(section.Rows, r => Assert.Equal("M", r.Size));
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("Front A3"));
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("Back A3"));
    }

    [Fact]
    public void Same_colour_and_size_with_different_print_sizes_stays_two_rows_with_distinguishing_detail()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A4SizeId, "A4", "A4"),
            })));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("Front A3"));
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("Front A4"));
    }

    [Fact]
    public void Same_colour_and_size_with_different_artwork_stays_two_rows_with_distinguishing_detail()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    uploadedAssetId: OrderProjectionFixtures.Id(900),
                    uploadedAssetUrl: "/uploads/designs/logo_20260701_aaa111_design-a.png"),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    uploadedAssetId: OrderProjectionFixtures.Id(901),
                    uploadedAssetUrl: "/uploads/designs/logo_20260701_bbb222_design-b.png"),
            })));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("design-a.png"));
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("design-b.png"));
        // The storage-generated upload prefix is stripped, and no path/host survives.
        Assert.All(section.Rows, r => Assert.DoesNotContain("/uploads/", r.ProductionSummary));
        Assert.All(section.Rows, r => Assert.DoesNotContain("20260701", r.ProductionSummary));
    }

    [Fact]
    public void Same_colour_and_size_with_different_notes_stays_two_rows_with_distinguishing_detail()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    notes: "centre 50 mm below collar"),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    notes: "align to left seam"),
            })));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionLines.Contains("Note: centre 50 mm below collar"));
        Assert.Contains(section.Rows, r => r.ProductionLines.Contains("Note: align to left seam"));
    }

    [Fact]
    public void Same_colour_and_size_with_different_design_notes_stays_two_rows_with_distinguishing_detail()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    designNote: "Design A"),
            }),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    designNote: "Design B"),
            })));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("Front A3 — Design A"));
        Assert.Contains(section.Rows, r => r.ProductionSummary.Contains("Front A3 — Design B"));
    }

    [Fact]
    public void Rows_that_differ_only_by_unit_price_are_disambiguated_rather_than_left_looking_identical()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, unitPrice: 30m),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, unitPrice: 34.5m)));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionLines.Contains("Unit price: 30.00 NZD"));
        Assert.Contains(section.Rows, r => r.ProductionLines.Contains("Unit price: 34.50 NZD"));
    }

    [Fact]
    public void Rows_that_differ_only_by_a_never_printed_field_still_never_read_as_one_line()
    {
        // Same label, same price, same prints — only the variant id differs. The sheet has no column for
        // it, so an explicit marker is added rather than letting two identical lines appear.
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, variantId: OrderProjectionFixtures.Id(501)),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 3, variantId: OrderProjectionFixtures.Id(502))));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Contains(section.Rows, r => r.ProductionLines.Contains("Production variant 1 of 2"));
        Assert.Contains(section.Rows, r => r.ProductionLines.Contains("Production variant 2 of 2"));
    }

    [Fact]
    public void Ordinary_rows_gain_no_disambiguation_noise()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / L", quantity: 2, variantId: OrderProjectionFixtures.Id(501))));

        Assert.All(section.Rows, r => Assert.Equal(new[] { "Front A3" }, r.ProductionLines));
    }

    // ── 4. Missing / fallback values ────────────────────────────────────────────

    [Fact]
    public void A_missing_size_renders_the_controlled_fallback_and_keeps_the_row()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "OneSize", quantity: 4)));

        var row = Assert.Single(section.Rows);
        Assert.Equal("OneSize", row.Colour);
        Assert.Equal("—", row.Size);
        Assert.Equal(4, row.Quantity);
    }

    [Fact]
    public void A_missing_colour_and_size_renders_the_controlled_fallback_and_keeps_the_row()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), variantLabel: null, quantity: 4)));

        var row = Assert.Single(section.Rows);
        Assert.Equal("—", row.Colour);
        Assert.Equal("—", row.Size);
        Assert.Equal(4, row.Quantity);
    }

    [Fact]
    public void A_whitespace_only_variant_label_never_renders_a_blank_cell()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "   ", quantity: 1)));

        var row = Assert.Single(section.Rows);
        Assert.Equal("—", row.Colour);
        Assert.Equal("—", row.Size);
    }

    [Fact]
    public void A_garment_with_no_prints_stays_visible_with_a_controlled_label()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 6,
                prints: Array.Empty<OrderItemPrintDto>())));

        var row = Assert.Single(section.Rows);
        Assert.Equal(6, row.Quantity);
        Assert.Equal(new[] { "No print placements" }, row.ProductionLines);
    }

    [Fact]
    public void A_blank_snapshotted_print_label_falls_back_without_dropping_the_print()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 1, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "  ", "FRONT", OrderProjectionFixtures.A3SizeId, "", "A3"),
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.BackAreaId, "Back", "BACK", OrderProjectionFixtures.A4SizeId, "A4", "A4"),
            })));

        var row = Assert.Single(section.Rows);
        Assert.Equal(2, row.ProductionLines.Count); // neither print was dropped
        Assert.Contains("Unspecified Unspecified", row.ProductionLines);
        Assert.Contains("Back A4", row.ProductionLines);
    }

    [Fact]
    public void A_blank_product_name_renders_the_controlled_fallback_without_touching_the_projection()
    {
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 2, productName: "   "));

        Assert.Equal("Unnamed product", Single(order).ProductName);

        // Display formatting only — the builder's snapshot is untouched.
        Assert.Equal("   ", Assert.Single(OrderProductGroupBuilder.Build(order)).ProductName);
    }

    [Fact]
    public void A_long_product_name_and_a_long_production_detail_are_carried_verbatim_for_wrapping()
    {
        var longName = new string('N', 180);
        var longNote = new string('D', 400);

        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 1,
                productName: longName,
                prints: new[]
                {
                    OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT",
                        OrderProjectionFixtures.A3SizeId, "A3", "A3", notes: longNote),
                })));

        Assert.Equal(longName, section.ProductName);
        Assert.Contains($"Note: {longNote}", section.Rows[0].ProductionLines);
    }

    // ── 5. Badge and Banner ─────────────────────────────────────────────────────

    [Fact]
    public void A_badge_product_uses_the_compact_layout_and_shows_quantity_design_and_tier()
    {
        var section = Single(OrderProjectionFixtures.Order(OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21))));

        Assert.Equal(ProductionPdfRowLayout.CompactDesign, section.Layout);
        Assert.Equal("Badge", section.KindLabel);
        Assert.Equal(25, section.TotalQuantity);

        var row = Assert.Single(section.Rows);
        Assert.Equal(25, row.Quantity);
        Assert.Equal("—", row.Colour); // no meaningless garment data is invented
        Assert.Equal("—", row.Size);
        Assert.Contains("Design: club.png — Club logo", row.ProductionLines);
        Assert.Contains("Quantity tier: 25+", row.ProductionLines);
    }

    [Fact]
    public void A_badge_with_no_design_still_renders_a_controlled_design_line()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21), uploadedAssetUrl: null, designNote: null,
                appliedQuantityTierMinQuantity: null)));

        Assert.Equal(new[] { "Design: No design uploaded" }, Assert.Single(section.Rows).ProductionLines);
    }

    [Fact]
    public void A_fixed_size_banner_shows_its_persisted_configuration_snapshot()
    {
        var section = Single(OrderProjectionFixtures.Order(OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20))));

        Assert.Equal(ProductionPdfRowLayout.CompactDesign, section.Layout);
        Assert.Equal("Banner", section.KindLabel);

        var row = Assert.Single(section.Rows);
        Assert.Equal(2, row.Quantity);
        Assert.Contains("850 x 2000 mm", row.ProductionSummary);
        Assert.Contains("Pull-up", row.ProductionSummary);
        Assert.Contains("Stand included", row.ProductionSummary);
        Assert.Contains("Design: expo.png", row.ProductionSummary);
    }

    [Fact]
    public void A_custom_dimension_banner_shows_its_dimensions_material_finishing_and_notes()
    {
        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20), detail: OrderProjectionFixtures.CustomBannerDetail())));

        var row = Assert.Single(section.Rows);
        Assert.Contains("1.2×2.4 m (2.88 m²)", row.ProductionSummary);
        Assert.Contains("Mesh", row.ProductionSummary);
        Assert.Contains("Eyelets, Hemming", row.ProductionSummary);
        Assert.Contains("Banner notes: Reinforce corners.", row.ProductionLines);
    }

    [Fact]
    public void Two_banner_rows_differing_only_by_finishing_stay_separate_and_readably_different()
    {
        var withStand = OrderProjectionFixtures.CustomBannerDetail();
        var withoutStand = OrderProjectionFixtures.CustomBannerDetail();
        withoutStand.FinishingHemming = false;

        var section = Single(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20), quantity: 2, detail: withStand),
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(21), quantity: 5, detail: withoutStand)));

        Assert.Equal(2, section.Rows.Count);
        AssertRowsRenderDistinctly(section);
        Assert.Equal(7, section.TotalQuantity);
    }

    [Fact]
    public void A_banner_whose_structured_detail_is_genuinely_absent_still_renders_its_row()
    {
        // The fixture substitutes a preset detail for null, so the item is built directly here.
        var banner = OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20));
        banner.BannerDetail = null;

        var section = Single(OrderProjectionFixtures.Order(banner));

        var row = Assert.Single(section.Rows);
        Assert.Equal(2, row.Quantity);
        Assert.Equal(new[] { "Design: expo.png" }, row.ProductionLines);
    }

    // ── 6. Quantity and leakage invariants ──────────────────────────────────────

    [Fact]
    public void Every_displayed_row_reconciles_to_its_product_total_and_the_order_total()
    {
        foreach (var order in RepresentativeOrders())
        {
            var model = Build(order);

            foreach (var section in model.Sections)
                Assert.Equal(section.TotalQuantity, section.Rows.Sum(r => r.Quantity));

            Assert.Equal(order.Items.Sum(i => i.Quantity), model.TotalQuantity);
            Assert.Equal(model.TotalQuantity, model.Sections.Sum(s => s.TotalQuantity));
        }
    }

    [Fact]
    public void One_projected_row_produces_exactly_one_displayed_row_and_none_is_ever_omitted()
    {
        foreach (var order in RepresentativeOrders())
        {
            var groups = OrderProductGroupBuilder.Build(order);
            var model = Build(order);

            Assert.Equal(groups.Sum(g => g.Rows.Count), model.Sections.Sum(s => s.Rows.Count));

            // Every source order item is still represented exactly once across displayed rows.
            var displayedIds = model.Sections.SelectMany(s => s.Rows).SelectMany(r => r.SourceOrderItemIds).ToList();
            Assert.Equal(displayedIds.Count, displayedIds.Distinct().Count());
            Assert.Equal(
                order.Items.Select(i => i.Id).OrderBy(i => i).ToList(),
                displayedIds.OrderBy(i => i).ToList());
        }
    }

    [Fact]
    public void Every_product_appears_exactly_once()
    {
        foreach (var order in RepresentativeOrders())
        {
            var model = Build(order);

            Assert.Equal(model.Sections.Count, model.Sections.Select(s => s.GroupKey).Distinct().Count());
            Assert.Equal(
                order.Items.Select(i => (i.ProductId, i.ProductKind, i.PricingModel)).Distinct().Count(),
                model.Sections.Count);
        }
    }

    /// <summary>
    /// Replaces the Jira 10104 "one checklist pair per displayed row" assertion, whose premise the
    /// Jira 10105 column removal made obsolete. The property that still matters — every projected row
    /// reaches the sheet as its own displayed row, and a multi-row product is never collapsed — is kept.
    /// </summary>
    [Fact]
    public void Every_projected_row_reaches_the_sheet_as_its_own_displayed_row()
    {
        foreach (var order in RepresentativeOrders())
        {
            var model = Build(order);
            var displayedRows = model.Sections.Sum(s => s.Rows.Count);

            Assert.Equal(OrderProductGroupBuilder.Build(order).Sum(g => g.Rows.Count), displayedRows);
            Assert.True(displayedRows >= model.Sections.Count,
                "A product with multiple rows must not be collapsed to a single displayed row.");
        }
    }

    [Fact]
    public void No_raw_source_id_row_key_signature_or_internal_guid_is_ever_displayed()
    {
        foreach (var order in RepresentativeOrders())
        {
            var groups = OrderProductGroupBuilder.Build(order);
            var model = Build(order);

            var displayed = string.Join("\n", model.Sections.SelectMany(s =>
                new[] { s.ProductName, s.KindLabel ?? string.Empty }
                    .Concat(s.Rows.Select(r => $"{r.Colour}\n{r.Size}\n{r.ProductionSummary}"))));

            foreach (var id in order.Items.Select(i => i.Id))
            {
                Assert.DoesNotContain(id.ToString("N"), displayed, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain(id.ToString("D"), displayed, StringComparison.OrdinalIgnoreCase);
            }

            foreach (var row in groups.SelectMany(g => g.Rows))
                Assert.DoesNotContain(row.RowKey, displayed, StringComparison.Ordinal);

            foreach (var group in groups)
                Assert.DoesNotContain(group.GroupKey, displayed, StringComparison.Ordinal);

            // The builder's signature separators (ASCII Unit/Record Separator) can never reach the page.
            Assert.DoesNotContain(((char)0x1F).ToString(), displayed, StringComparison.Ordinal);
            Assert.DoesNotContain(((char)0x1E).ToString(), displayed, StringComparison.Ordinal);
            Assert.DoesNotContain("/uploads/", displayed, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void No_displayed_cell_is_ever_null_empty_or_whitespace_only()
    {
        foreach (var order in RepresentativeOrders())
        {
            foreach (var section in Build(order).Sections)
            {
                Assert.False(string.IsNullOrWhiteSpace(section.ProductName));

                foreach (var row in section.Rows)
                {
                    Assert.False(string.IsNullOrWhiteSpace(row.Colour));
                    Assert.False(string.IsNullOrWhiteSpace(row.Size));
                    Assert.NotEmpty(row.ProductionLines);
                    Assert.All(row.ProductionLines, line => Assert.False(string.IsNullOrWhiteSpace(line)));
                    Assert.DoesNotContain("undefined", row.ProductionSummary, StringComparison.OrdinalIgnoreCase);
                }
            }
        }
    }

    [Fact]
    public void The_model_is_built_with_no_container_database_repository_or_catalogue()
    {
        // Plain DTOs in, plain records out — a hidden dependency could not compile, let alone resolve.
        var model = Build(OrderProjectionFixtures.MixedOrder());

        Assert.NotEmpty(model.Sections);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private static void AssertRowsRenderDistinctly(ProductionPdfProductSection section)
    {
        var renderings = section.Rows
            .Select(r => $"{r.Colour}|{r.Size}|{r.ProductionSummary}")
            .ToList();

        Assert.Equal(renderings.Count, renderings.Distinct().Count());
    }

    internal static IEnumerable<OrderDto> RepresentativeOrders()
    {
        yield return OrderProjectionFixtures.Order();
        yield return OrderProjectionFixtures.MixedOrder();
        yield return OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / M", quantity: 4));
        yield return OrderProjectionFixtures.Order(OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21)));
        yield return OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20), detail: OrderProjectionFixtures.CustomBannerDetail()));
        yield return OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(40), "Navy / White / XL", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(41), "OneSize", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(42), " / M", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(43), "Black / ", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(44), "   ", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(45), null, quantity: 1,
                prints: Array.Empty<OrderItemPrintDto>()));
        yield return LongLabelOrder();
        yield return LargeGarmentOrder(40);
    }

    /// <summary>Long product name, long colour, long design note and multiple placements.</summary>
    internal static OrderDto LongLabelOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(60),
            variantLabel: $"{new string('C', 90)} / {new string('S', 30)}",
            quantity: 12,
            productName: new string('P', 160),
            prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT",
                    OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    uploadedAssetUrl: "/uploads/designs/logo_20260701_aaa111_" + new string('f', 90) + ".png",
                    designNote: new string('N', 200),
                    notes: new string('X', 300)),
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1002), OrderProjectionFixtures.BackAreaId, "Back", "BACK",
                    OrderProjectionFixtures.A4SizeId, "A4", "A4", notes: new string('Y', 250)),
            }),
        OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(61),
            detail: LongNoteBannerDetail(),
            productName: new string('B', 140)));

    private static BannerDetailDto LongNoteBannerDetail()
    {
        var detail = OrderProjectionFixtures.CustomBannerDetail();
        detail.Notes = new string('Z', 400);
        detail.MaterialDisplayName = null;
        return detail;
    }

    /// <summary>A single product with enough production-distinct rows to span pages.</summary>
    internal static OrderDto LargeGarmentOrder(int rows)
    {
        var colours = new[] { "Black", "White", "Navy", "Forest Green", "Burgundy", "Sky Blue", "Charcoal", "Sand" };
        var sizes = new[] { "XS", "S", "M", "L", "XL", "XXL" };

        var items = Enumerable.Range(0, rows)
            .Select(i => OrderProjectionFixtures.Garment(
                OrderProjectionFixtures.Id(2000 + i),
                $"{colours[i % colours.Length]} / {sizes[(i / colours.Length) % sizes.Length]}",
                quantity: (i % 7) + 1,
                variantId: OrderProjectionFixtures.Id(3000 + i),
                prints: new[]
                {
                    OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(4000 + i),
                        i % 2 == 0 ? OrderProjectionFixtures.FrontAreaId : OrderProjectionFixtures.BackAreaId,
                        i % 2 == 0 ? "Front" : "Back", "AREA",
                        OrderProjectionFixtures.A3SizeId, "A3", "A3",
                        notes: i % 3 == 0 ? $"Placement note {i}" : null),
                }))
            .ToArray();

        return OrderProjectionFixtures.Order(items);
    }
}
