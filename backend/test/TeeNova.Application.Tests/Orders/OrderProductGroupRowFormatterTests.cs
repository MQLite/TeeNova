using System;
using System.Collections.Generic;
using System.Linq;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Jira 10104 — the pure production-detail formatter. Every display fallback lives here and nowhere else,
/// so these are the tests that pin the sheet's wording without generating a PDF.
/// </summary>
public sealed class OrderProductGroupRowFormatterTests
{
    private static OrderProductGroupRow Row(
        string? colour = "Black",
        string? size = "M",
        string? variantLabel = "Black / M",
        int quantity = 1,
        int? tier = null,
        Guid? assetId = null,
        string? assetUrl = null,
        string? designNote = null,
        BannerDetailDto? banner = null,
        params OrderProductGroupPrint[] prints)
        => new()
        {
            RowKey = "test",
            Colour = colour,
            Size = size,
            VariantLabel = variantLabel,
            Quantity = quantity,
            UnitPrice = 30m,
            AppliedQuantityTierMinQuantity = tier,
            UploadedAssetId = assetId,
            UploadedAssetUrl = assetUrl,
            DesignNote = designNote,
            BannerDetail = banner,
            Prints = prints,
            SourceOrderItemIds = new[] { OrderProjectionFixtures.Id(1) },
        };

    private static OrderProductGroupPrint Print(
        string areaName = "Front", string sizeName = "A3",
        string? assetUrl = null, string? designNote = null, string? notes = null)
        => new()
        {
            PrintAreaId = OrderProjectionFixtures.FrontAreaId,
            PrintAreaName = areaName,
            PrintAreaCode = "FRONT",
            PrintSizeId = OrderProjectionFixtures.A3SizeId,
            PrintSizeName = sizeName,
            PrintSizeCode = "A3",
            UploadedAssetUrl = assetUrl,
            DesignNote = designNote,
            Notes = notes,
        };

    // ── Product name ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null, "Unnamed product")]
    [InlineData("", "Unnamed product")]
    [InlineData("   ", "Unnamed product")]
    [InlineData("Staple Tee", "Staple Tee")]
    [InlineData("  Staple Tee  ", "Staple Tee")]
    public void Product_name_falls_back_only_when_the_snapshot_is_blank(string? snapshot, string expected)
        => Assert.Equal(expected, OrderProductGroupRowFormatter.ProductName(snapshot));

    // ── Kind label ──────────────────────────────────────────────────────────────

    [Fact]
    public void Kind_label_clarifies_non_garment_products_only()
    {
        Assert.Null(OrderProductGroupRowFormatter.KindLabel(ProductKind.Garment));
        Assert.Equal("Badge", OrderProductGroupRowFormatter.KindLabel(ProductKind.Badge));
        Assert.Equal("Banner", OrderProductGroupRowFormatter.KindLabel(ProductKind.Banner));
        Assert.Equal("Other", OrderProductGroupRowFormatter.KindLabel(ProductKind.Other));
        Assert.Equal("Unspecified type", OrderProductGroupRowFormatter.KindLabel((ProductKind)999));
    }

    // ── Colour and size ─────────────────────────────────────────────────────────

    [Fact]
    public void Colour_and_size_use_the_projection_and_fall_back_to_an_em_dash()
    {
        Assert.Equal("Black", OrderProductGroupRowFormatter.Colour(Row()));
        Assert.Equal("M", OrderProductGroupRowFormatter.Size(Row()));

        Assert.Equal("—", OrderProductGroupRowFormatter.Colour(Row(colour: null, size: null, variantLabel: null)));
        Assert.Equal("—", OrderProductGroupRowFormatter.Size(Row(colour: null, size: null, variantLabel: null)));

        Assert.Equal("—", OrderProductGroupRowFormatter.Colour(Row(colour: "  ", variantLabel: null)));
        Assert.Equal("—", OrderProductGroupRowFormatter.Size(Row(size: "")));
    }

    [Fact]
    public void A_raw_variant_label_is_only_a_defensive_fallback_for_a_missing_colour()
    {
        // Never overrides a parsed colour…
        Assert.Equal("Black", OrderProductGroupRowFormatter.Colour(Row(colour: "Black", variantLabel: "Navy / M")));

        // …but a label that produced no colour at all is still better than an empty cell.
        Assert.Equal("Odd Label", OrderProductGroupRowFormatter.Colour(Row(colour: null, variantLabel: "Odd Label")));
    }

    // ── Garment production detail ───────────────────────────────────────────────

    [Fact]
    public void A_placement_renders_as_area_then_print_size()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(prints: new[] { Print("Left Chest", "A5") }), ProductKind.Garment);

        Assert.Equal(new[] { "Left Chest A5" }, lines);
    }

    [Fact]
    public void Multiple_placements_each_get_their_own_line()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(prints: new[] { Print("Front", "A3"), Print("Back", "A4") }), ProductKind.Garment);

        Assert.Equal(new[] { "Front A3", "Back A4" }, lines);
    }

    [Fact]
    public void A_design_note_and_an_artwork_name_are_both_shown_without_hiding_the_placement()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(prints: new[]
            {
                Print("Front", "A3", assetUrl: "/uploads/designs/logo_20260701_aaa111_logo-front.png"),
                Print("Back", "A4", designNote: "Player name"),
                Print("Sleeve", "A6",
                    assetUrl: "/uploads/designs/logo_20260701_bbb222_crest.png", designNote: "Club crest"),
            }), ProductKind.Garment);

        Assert.Equal(
            new[] { "Front A3 — logo-front.png", "Back A4 — Player name", "Sleeve A6 — crest.png — Club crest" },
            lines);
    }

    [Fact]
    public void A_production_note_gets_its_own_line_directly_under_its_placement()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(prints: new[]
            {
                Print("Front", "A3", assetUrl: "/uploads/designs/logo_20260701_aaa111_logo-front.png",
                    notes: "centre 50 mm below collar"),
                Print("Back", "A4"),
            }), ProductKind.Garment);

        Assert.Equal(
            new[] { "Front A3 — logo-front.png", "Note: centre 50 mm below collar", "Back A4" },
            lines);
    }

    [Fact]
    public void A_blank_print_label_uses_the_controlled_fallback_and_keeps_the_print()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(prints: new[] { Print("", "  "), Print("Back", "") }), ProductKind.Garment);

        Assert.Equal(new[] { "Unspecified Unspecified", "Back Unspecified" }, lines);
    }

    [Fact]
    public void A_garment_with_no_placements_stays_visible()
    {
        Assert.Equal(
            new[] { "No print placements" },
            OrderProductGroupRowFormatter.ProductionLines(Row(), ProductKind.Garment));
    }

    [Fact]
    public void An_item_level_design_on_a_garment_is_not_silently_dropped()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(assetUrl: "/uploads/designs/item_20260701_aaa111_extra.png", prints: new[] { Print() }),
            ProductKind.Garment);

        Assert.Equal(new[] { "Front A3", "Design: extra.png" }, lines);
    }

    // ── Non-garment production detail ───────────────────────────────────────────

    [Fact]
    public void A_badge_row_shows_its_design_label_note_and_quantity_tier()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(colour: null, size: null, variantLabel: null, tier: 50,
                assetUrl: "/uploads/designs/badge_20260701_aaa111_school-logo.png",
                designNote: "blue border"),
            ProductKind.Badge);

        Assert.Equal(new[] { "Design: school-logo.png — blue border", "Quantity tier: 50+" }, lines);
    }

    [Fact]
    public void A_non_garment_row_with_no_design_still_renders_a_controlled_line()
        => Assert.Equal(
            new[] { "Design: No design uploaded" },
            OrderProductGroupRowFormatter.ProductionLines(
                Row(colour: null, size: null, variantLabel: null), ProductKind.Badge));

    [Fact]
    public void A_banner_row_renders_size_material_and_finishing_on_one_configuration_line()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(colour: null, size: null, variantLabel: null,
                banner: OrderProjectionFixtures.CustomBannerDetail(),
                assetUrl: "/uploads/designs/banner_20260701_aaa111_logo-final.pdf"),
            ProductKind.Banner);

        Assert.Equal(3, lines.Count);
        Assert.Equal("1.2×2.4 m (2.88 m²)  ·  Mesh  ·  Eyelets, Hemming", lines[0]);
        Assert.Equal("Banner notes: Reinforce corners.", lines[1]);
        Assert.Equal("Design: logo-final.pdf", lines[2]);
    }

    [Fact]
    public void A_banner_row_with_no_structured_detail_still_renders_its_design_line()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(colour: null, size: null, variantLabel: null,
                assetUrl: "/uploads/designs/banner_20260701_aaa111_logo.pdf"),
            ProductKind.Banner);

        Assert.Equal(new[] { "Design: logo.pdf" }, lines);
    }

    [Fact]
    public void A_non_garment_row_that_unexpectedly_carries_a_variant_label_does_not_lose_it()
    {
        var lines = OrderProductGroupRowFormatter.ProductionLines(
            Row(colour: null, size: null, variantLabel: "Legacy label"), ProductKind.Other);

        Assert.Equal("Legacy label", lines[0]);
    }

    // ── Leakage and money ───────────────────────────────────────────────────────

    [Fact]
    public void A_design_label_never_exposes_a_scheme_host_query_or_storage_path()
    {
        var label = OrderProductGroupRowFormatter.DesignLabel(
            "https://cdn.example.test/uploads/designs/logo_20260701_aaa111_customer%20logo.png?v=1#preview", null);

        Assert.Equal("customer logo.png", label);
    }

    [Fact]
    public void A_design_label_is_null_only_when_there_is_neither_artwork_nor_a_note()
    {
        Assert.Null(OrderProductGroupRowFormatter.DesignLabel(null, null));
        Assert.Null(OrderProductGroupRowFormatter.DesignLabel("   ", "  "));
        Assert.Equal("Just a note", OrderProductGroupRowFormatter.DesignLabel(null, "  Just a note  "));
    }

    [Fact]
    public void The_design_name_comes_from_the_shared_resolver_rather_than_a_third_parser()
    {
        const string url = "/uploads/designs/logo_20260701_aaa111_shared.png";

        Assert.Equal(
            OrderDesignNameResolver.Resolve(url).DesignName,
            OrderProductGroupRowFormatter.DesignLabel(url, null));
    }

    [Theory]
    [InlineData(0, "0.00 NZD")]
    [InlineData(30, "30.00 NZD")]
    [InlineData(1250.5, "1,250.50 NZD")]
    public void Money_formatting_is_culture_independent(double value, string expected)
        => Assert.Equal(expected, OrderProductGroupRowFormatter.Money((decimal)value));

    [Fact]
    public void Production_lines_are_never_empty_and_never_blank()
    {
        var rows = new List<(OrderProductGroupRow Row, ProductKind Kind)>
        {
            (Row(), ProductKind.Garment),
            (Row(colour: null, size: null, variantLabel: null), ProductKind.Badge),
            (Row(colour: null, size: null, variantLabel: null), ProductKind.Banner),
            (Row(colour: null, size: null, variantLabel: null), ProductKind.Other),
            (Row(prints: new[] { Print("", "") }), ProductKind.Garment),
        };

        foreach (var (row, kind) in rows)
        {
            var lines = OrderProductGroupRowFormatter.ProductionLines(row, kind);

            Assert.NotEmpty(lines);
            Assert.All(lines, line => Assert.False(string.IsNullOrWhiteSpace(line)));
        }
    }
}
