using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Jira 10104 — generation smoke tests and pagination evidence for the grouped production sheet.
///
/// The repository has no PDF text-extraction or screenshot tooling, so nothing here searches compressed
/// content streams for words. Page COUNT, however, is readable: QuestPDF writes the page tree
/// uncompressed, so <c>/Type /Page</c> objects can be counted directly from the bytes. Layout meaning is
/// asserted on the pure rendering model (see <c>OrderProductionPdfCompositionTests</c>); what these tests
/// add is that every representative shape generates a real, correctly-paginated document without
/// throwing — in particular that no page-break strategy can raise a QuestPDF layout exception.
/// </summary>
public sealed class OrderProductionPdfPaginationTests
{
    private static readonly string? DumpDir = Environment.GetEnvironmentVariable("TEENOVA_PDF_BASELINE_DIR");

    private static readonly Regex PageObject = new(@"/Type\s*/Page(?![s/\w])", RegexOptions.Compiled);

    private static async Task<OrderProductionPdfResult> GenerateAsync(OrderDto order, string name)
    {
        var result = await new OrderProductionPdfService(new FakeOrderAppService(order)).GenerateAsync(order.Id);

        if (!string.IsNullOrWhiteSpace(DumpDir))
        {
            Directory.CreateDirectory(DumpDir!);
            await File.WriteAllBytesAsync(Path.Combine(DumpDir!, $"{name}.pdf"), result.Content);
        }

        return result;
    }

    /// <summary>Counts page objects in the (uncompressed) PDF page tree.</summary>
    internal static int PageCount(byte[] pdf)
        => PageObject.Matches(Encoding.Latin1.GetString(pdf)).Count;

    private static void AssertIsARealPdf(OrderProductionPdfResult result)
    {
        Assert.NotEmpty(result.Content);
        Assert.True(result.Content.Length > 1000, $"Expected a real PDF, got {result.Content.Length} bytes.");
        Assert.Equal(new byte[] { 0x25, 0x50, 0x44, 0x46 }, result.Content[..4]); // "%PDF"
        Assert.Equal("application/pdf", result.ContentType);
        Assert.Equal("Order-ORD-10103-TEST-production-sheet.pdf", result.FileName);
        Assert.True(PageCount(result.Content) >= 1);
    }

    public static IEnumerable<object[]> SmokeCases()
    {
        yield return new object[] { "empty-order", OrderProjectionFixtures.Order() };
        yield return new object[]
        {
            "one-small-product",
            OrderProjectionFixtures.Order(
                OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3)),
        };
        yield return new object[] { "mixed-order", OrderProjectionFixtures.MixedOrder() };
        yield return new object[]
        {
            "badge-only",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21))),
        };
        yield return new object[]
        {
            "banner-only-preset",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20))),
        };
        yield return new object[]
        {
            "banner-only-custom",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Banner(
                OrderProjectionFixtures.Id(20), detail: OrderProjectionFixtures.CustomBannerDetail())),
        };
        yield return new object[] { "long-labels", OrderProductionPdfCompositionTests.LongLabelOrder() };
        yield return new object[] { "missing-values", MissingValuesOrder() };
        yield return new object[] { "large-quantities", LargeQuantityOrder() };
        yield return new object[] { "many-products", ManyProductsOrder(24) };
        yield return new object[] { "multi-page-single-product", OrderProductionPdfCompositionTests.LargeGarmentOrder(60) };
    }

    public static IEnumerable<object[]> Jira10106SmokeCases()
    {
        yield return new object[]
        {
            "10106-no-print",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Garment(
                OrderProjectionFixtures.Id(110), quantity: 2, prints: Array.Empty<OrderItemPrintDto>())),
        };
        yield return new object[]
        {
            "10106-one-a3",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Garment(
                OrderProjectionFixtures.Id(111), quantity: 1)),
        };
        yield return new object[] { "10106-worked-a3-5-a4-4", WorkedExampleOrder() };
        yield return new object[] { "10106-front-a4-back-a3", TwoPlacementOrder("A4", "A3", 3) };
        yield return new object[] { "10106-front-a3-back-a3", TwoPlacementOrder("A3", "A3", 5) };
        yield return new object[] { "10106-multiple-designs", MultipleDesignOrder() };
        yield return new object[] { "10106-same-design-multiple-positions", TwoPlacementOrder("A4", "A3", 3) };
        yield return new object[] { "10106-a3-label-variants", A3VariantOrder() };
        yield return new object[] { "10106-custom-sizes", CustomSizeOrder() };
        yield return new object[] { "10106-missing-labels", MissingPrintLabelsOrder() };
        yield return new object[]
        {
            "10106-badge-only",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(121))),
        };
        yield return new object[]
        {
            "10106-banner-only",
            OrderProjectionFixtures.Order(OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(122))),
        };
        yield return new object[] { "10106-mixed-garment-badge-banner", OrderProjectionFixtures.MixedOrder() };
        yield return new object[] { "10106-many-detailed-groups", ManyDetailedGroupsOrder(32) };
        yield return new object[] { "10106-long-design-and-size-labels", LongPrintLabelsOrder() };
        yield return new object[] { "10106-multi-page-single-product", OrderProductionPdfCompositionTests.LargeGarmentOrder(60) };
        yield return new object[] { "10106-pathological-long-note", PathologicalLongNoteOrder() };
    }

    public static IEnumerable<object[]> Jira10107SmokeCases()
    {
        yield return new object[] { "10107-one-product-multiple-variations", MultipleVariationOrder() };
        yield return new object[] { "10107-same-variant-different-prints", SameVariantDifferentPrintsOrder() };
        yield return new object[] { "10107-same-name-different-product-ids", SameNameDifferentProductIdsOrder() };
        yield return new object[] { "10107-exact-duplicate-source-items", ExactDuplicateSourceItemsOrder() };
        yield return new object[] { "10107-historical-snapshot", HistoricalSnapshotOrder() };
    }

    [Theory]
    [MemberData(nameof(SmokeCases))]
    public async Task Every_representative_order_generates_a_valid_document(string name, OrderDto order)
    {
        var result = await GenerateAsync(order, name);

        AssertIsARealPdf(result);
    }

    [Theory]
    [MemberData(nameof(Jira10106SmokeCases))]
    public async Task Every_jira_10106_statistics_smoke_fixture_generates_without_layout_failure(
        string name, OrderDto order)
    {
        var result = await GenerateAsync(order, name);

        AssertIsARealPdf(result);
    }

    [Theory]
    [MemberData(nameof(Jira10107SmokeCases))]
    public async Task Every_jira_10107_final_gate_fixture_generates_without_layout_failure(
        string name, OrderDto order)
    {
        var result = await GenerateAsync(order, name);

        AssertIsARealPdf(result);
    }

    [Fact]
    public async Task A_small_product_fits_on_one_page()
    {
        var result = await GenerateAsync(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3)), "page-count-small");

        Assert.Equal(1, PageCount(result.Content));
    }

    [Fact]
    public async Task A_single_product_with_many_rows_spans_pages_without_throwing()
    {
        var order = OrderProductionPdfCompositionTests.LargeGarmentOrder(60);
        var model = OrderProductionPdfModelBuilder.Build(order);

        // One product, 60 production-distinct rows — well past a single page.
        Assert.Single(model.Sections);
        Assert.Equal(60, model.Sections[0].Rows.Count);

        var result = await GenerateAsync(order, "page-count-large-group");

        AssertIsARealPdf(result);
        Assert.True(PageCount(result.Content) >= 2,
            $"Expected the 60-row product to span pages, got {PageCount(result.Content)}.");
    }

    [Fact]
    public async Task Many_products_span_pages_without_throwing()
    {
        var result = await GenerateAsync(ManyProductsOrder(24), "page-count-many-products");

        AssertIsARealPdf(result);
        Assert.True(PageCount(result.Content) >= 2);
    }

    [Fact]
    public async Task An_extremely_long_production_detail_does_not_raise_a_layout_exception()
    {
        // The pathological case a blind ShowEntire() would fail on: one product, few rows, but a single
        // note far taller than a page. It must page normally rather than throw.
        var order = PathologicalLongNoteOrder();

        var result = await GenerateAsync(order, "pathological-long-note");
        var pages = PageCount(result.Content);

        AssertIsARealPdf(result);
        Assert.True(pages >= 2);

        // Jira 10105 — this note needed 18 pages before the checklist columns were removed (measured on
        // the preserved pre-10105 artefact; Jira 10104 §34 mis-stated it as 8 because the reporting
        // shell command read the first /Count entry of a NESTED page tree instead of the root). The
        // wider detail column cuts it to 13, so the reclaimed width is demonstrably being used.
        Assert.True(pages <= 14, $"The pathological note now needs {pages} pages, up from 13.");
    }

    /// <summary>
    /// Jira 10105 — the reclaimed checklist width must actually be used, not merely released. Wider
    /// detail columns mean fewer wrapped lines, so a detail-heavy sheet must not need MORE pages than it
    /// did before the columns were removed. The reference values are the Jira 10104 §34 measurements,
    /// taken from the final pre-10105 build on this host.
    /// </summary>
    [Theory]
    [InlineData("one-small-product", 1)]
    [InlineData("mixed-order", 2)]
    [InlineData("badge-only", 1)]
    [InlineData("banner-only-preset", 1)]
    [InlineData("banner-only-custom", 1)]
    [InlineData("long-labels", 2)]
    // Jira 10106 adds the required summary table and exact group count. This already-dense mixed
    // fallback fixture moves from one page to two; all product columns remain at their 10105 widths.
    [InlineData("missing-values", 2)]
    [InlineData("large-quantities", 1)]
    [InlineData("many-products", 5)]
    [InlineData("multi-page-single-product", 4)]
    public async Task No_representative_sheet_needs_more_pages_than_before_the_checklist_columns_were_removed(
        string name, int pagesBeforeChecklistRemoval)
    {
        var order = SmokeCases()
            .Select(c => new { Name = (string)c[0], Order = (OrderDto)c[1] })
            .Single(c => c.Name == name)
            .Order;

        var result = await GenerateAsync(order, $"reclaimed-width-{name}");
        var pages = PageCount(result.Content);

        Assert.True(
            pages <= pagesBeforeChecklistRemoval,
            $"'{name}' now needs {pages} pages but needed {pagesBeforeChecklistRemoval} before the "
            + "checklist columns were removed — the reclaimed width is not being used.");
    }

    [Fact]
    public async Task A_wide_production_detail_wraps_into_fewer_lines_than_a_narrow_one()
    {
        // A garment row's detail column is materially wider than the compact quantity column it sits
        // beside; a long note therefore has to reach a large length before it forces a second page.
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 4, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "Front", "FRONT",
                    OrderProjectionFixtures.A3SizeId, "A3", "A3",
                    notes: string.Join(" ", Enumerable.Repeat("wrap", 260))),
            }));

        var result = await GenerateAsync(order, "reclaimed-width-single-long-note");

        AssertIsARealPdf(result);
        // Jira 10106's summary plus exact detailed-group count is real new content. The product detail
        // still uses the reclaimed width, while the complete sheet now needs at most one additional page.
        Assert.InRange(PageCount(result.Content), 1, 2);
    }

    [Fact]
    public async Task Generation_is_stable_for_the_same_snapshot()
    {
        var order = OrderProductionPdfCompositionTests.LargeGarmentOrder(60);

        var first = await GenerateAsync(order, "stability-large-1");
        var second = await GenerateAsync(order, "stability-large-2");

        Assert.Equal(PageCount(first.Content), PageCount(second.Content));
        Assert.Equal(first.Content.Length, second.Content.Length);
    }

    [Fact]
    public async Task The_snapshot_is_read_exactly_once_and_no_other_service_is_touched()
    {
        // FakeOrderAppService throws on all 23 other IOrderAppService members, so any detour into a
        // catalogue, pricing or repository call through the app service would fail rather than pass.
        var fake = new FakeOrderAppService(OrderProductionPdfCompositionTests.LargeGarmentOrder(60));

        await new OrderProductionPdfService(fake).GenerateAsync(OrderProjectionFixtures.Id(9000));

        Assert.Equal(1, fake.GetAsyncCallCount);
    }

    // ── Fixtures ────────────────────────────────────────────────────────────────

    private static OrderDto MissingValuesOrder()
    {
        // A banner whose structured detail is genuinely absent (the fixture substitutes a preset for null).
        var banner = OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(43));
        banner.BannerDetail = null;

        return OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(40), null, quantity: 2,
                productName: "   ", productId: OrderProjectionFixtures.Id(9), prints: Array.Empty<OrderItemPrintDto>()),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(41), "   ", quantity: 1,
                variantId: OrderProjectionFixtures.Id(501), prints: new[]
                {
                    OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId, "", "",
                        OrderProjectionFixtures.A3SizeId, "  ", ""),
                }),
            OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(42), uploadedAssetUrl: null, designNote: null,
                appliedQuantityTierMinQuantity: null),
            banner);
    }

    private static OrderDto LargeQuantityOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(50), "Black / M", quantity: 999_999),
        OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(51), quantity: 250_000,
            appliedQuantityTierMinQuantity: 100_000));

    private static OrderDto MultipleVariationOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(130), "Black / S", quantity: 1,
            variantId: OrderProjectionFixtures.Id(530)),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(131), "Black / XL", quantity: 2,
            variantId: OrderProjectionFixtures.Id(531)),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(132), "White / M", quantity: 3,
            variantId: OrderProjectionFixtures.Id(532)));

    private static OrderDto SameVariantDifferentPrintsOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(133), "Black / M", quantity: 2,
            variantId: OrderProjectionFixtures.Id(533),
            prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1170),
                    OrderProjectionFixtures.FrontAreaId, "Front", "FRONT",
                    OrderProjectionFixtures.A3SizeId, "A3", "A3"),
            }),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(134), "Black / M", quantity: 3,
            variantId: OrderProjectionFixtures.Id(533),
            prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1171),
                    OrderProjectionFixtures.FrontAreaId, "Front", "FRONT",
                    OrderProjectionFixtures.A3SizeId, "A3", "A3"),
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1172),
                    OrderProjectionFixtures.BackAreaId, "Back", "BACK",
                    OrderProjectionFixtures.A4SizeId, "A4", "A4", sortOrder: 1),
            }));

    private static OrderDto SameNameDifferentProductIdsOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(135), "Black / M", quantity: 2,
            productId: OrderProjectionFixtures.TeeProductId, productName: "Shared display name",
            variantId: OrderProjectionFixtures.Id(534)),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(136), "White / L", quantity: 4,
            productId: OrderProjectionFixtures.TeeTwinProductId, productName: "Shared display name",
            variantId: OrderProjectionFixtures.Id(535)));

    private static OrderDto ExactDuplicateSourceItemsOrder()
    {
        OrderItemDto Duplicate(Guid itemId, Guid printId, int quantity) =>
            OrderProjectionFixtures.Garment(itemId, "Black / M", quantity: quantity,
                variantId: OrderProjectionFixtures.Id(536),
                prints: new[]
                {
                    OrderProjectionFixtures.Print(printId,
                        OrderProjectionFixtures.FrontAreaId, "Front", "FRONT",
                        OrderProjectionFixtures.A3SizeId, "A3", "A3",
                        uploadedAssetId: OrderProjectionFixtures.Id(904),
                        uploadedAssetUrl: "/historical/designs/exact-duplicate.png",
                        designNote: "Exact duplicate artwork"),
                });

        return OrderProjectionFixtures.Order(
            Duplicate(OrderProjectionFixtures.Id(137), OrderProjectionFixtures.Id(1173), 2),
            Duplicate(OrderProjectionFixtures.Id(138), OrderProjectionFixtures.Id(1174), 5));
    }

    private static OrderDto HistoricalSnapshotOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(139),
            "Retired Indigo / 3 XL", quantity: 6, unitPrice: 47.35m,
            productId: OrderProjectionFixtures.Id(9901),
            productName: "Discontinued 2024 Club Tee",
            variantId: OrderProjectionFixtures.Id(9902),
            prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1175),
                    OrderProjectionFixtures.Id(9903), "Historic left chest", "HIST-CHEST",
                    OrderProjectionFixtures.Id(9904), "Retired 110 x 85 mm", "HIST-110X85",
                    uploadedAssetId: null,
                    uploadedAssetUrl: "/historical/url-only/retired-club-mark.png",
                    designNote: "Use archived white-keyline version",
                    appliedPrintTierMinQuantity: 5),
            }));

    private static OrderDto WorkedExampleOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(110), "Black / M", quantity: 3, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1101), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
        }),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(111), "Black / L", quantity: 2, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1102), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3"),
        }),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(112), "White / M", quantity: 4, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1103), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.A4SizeId, "A4", "A4"),
        }));

    private static OrderDto TwoPlacementOrder(string frontSize, string backSize, int quantity)
        => OrderProjectionFixtures.Order(OrderProjectionFixtures.Garment(
            OrderProjectionFixtures.Id(113), "Black / M", quantity: quantity, prints: new[]
            {
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1111), OrderProjectionFixtures.FrontAreaId,
                    "Front", "FRONT", frontSize == "A3" ? OrderProjectionFixtures.A3SizeId : OrderProjectionFixtures.A4SizeId,
                    frontSize, frontSize, uploadedAssetId: OrderProjectionFixtures.Id(900),
                    uploadedAssetUrl: "/uploads/designs/tee_20260701_abc123_logo.png"),
                OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1112), OrderProjectionFixtures.BackAreaId,
                    "Back", "BACK", backSize == "A3" ? OrderProjectionFixtures.A3SizeId : OrderProjectionFixtures.A4SizeId,
                    backSize, backSize, uploadedAssetId: OrderProjectionFixtures.Id(900),
                    uploadedAssetUrl: "/uploads/designs/tee_20260701_abc123_logo.png", sortOrder: 1),
            }));

    private static OrderDto MultipleDesignOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(114), "Black / M", quantity: 2, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1121), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                uploadedAssetId: OrderProjectionFixtures.Id(901), uploadedAssetUrl: "/one/logo.png"),
        }),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(115), "White / L", quantity: 3, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1122), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                uploadedAssetId: OrderProjectionFixtures.Id(902), uploadedAssetUrl: "/two/logo.png"),
        }));

    private static OrderDto A3VariantOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(116), "Black / M", quantity: 2, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1131), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.Id(211), "A3", "A3"),
        }),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(117), "Black / L", quantity: 3, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1132), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.Id(212), "a3", "a3"),
        }),
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(118), "White / M", quantity: 4, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1133), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.Id(213), "A 3", "A 3"),
        }));

    private static OrderDto CustomSizeOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(119), quantity: 2, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1141), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.Id(221), "Chest 120 x 80 mm", "CUSTOM-1"),
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1142), OrderProjectionFixtures.BackAreaId,
                "Back", "BACK", OrderProjectionFixtures.Id(222), "A3+", "CUSTOM-2"),
        }));

    private static OrderDto MissingPrintLabelsOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(120), "Black / M", quantity: 2, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1151), OrderProjectionFixtures.FrontAreaId,
                " ", "", OrderProjectionFixtures.A3SizeId, "\t", "", uploadedAssetUrl: null),
        }));

    private static OrderDto ManyDetailedGroupsOrder(int groups)
    {
        var prints = Enumerable.Range(0, groups)
            .Select(index => OrderProjectionFixtures.Print(
                OrderProjectionFixtures.Id(2000 + index),
                OrderProjectionFixtures.Id(3000 + index),
                $"Position {index:00}",
                $"P{index:00}",
                OrderProjectionFixtures.Id(4000 + index),
                $"Custom size {index:00}",
                $"S{index:00}",
                uploadedAssetId: OrderProjectionFixtures.Id(5000 + index),
                uploadedAssetUrl: $"/designs/artwork-{index:00}.png"))
            .ToArray();

        return OrderProjectionFixtures.Order(OrderProjectionFixtures.Garment(
            OrderProjectionFixtures.Id(123), "Navy / XL", quantity: 2, prints: prints));
    }

    private static OrderDto LongPrintLabelsOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(124), "Forest Green / XXL", quantity: 7, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1161), OrderProjectionFixtures.FrontAreaId,
                "Front centre position with an unusually long but meaningful snapshotted production label",
                "FRONT-LONG", OrderProjectionFixtures.Id(231),
                "Custom transfer sheet 612 millimetres by 248 millimetres with bleed and registration marks",
                "CUSTOM-LONG", uploadedAssetId: OrderProjectionFixtures.Id(903),
                uploadedAssetUrl: "/uploads/designs/tee_20260701_abc123_a-very-long-production-artwork-file-name-for-the-club-season.png",
                designNote: "Use the anniversary crest variation and preserve the fine white keyline"),
        }));

    private static OrderDto PathologicalLongNoteOrder() => OrderProjectionFixtures.Order(
        OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 1, prints: new[]
        {
            OrderProjectionFixtures.Print(OrderProjectionFixtures.Id(1001), OrderProjectionFixtures.FrontAreaId,
                "Front", "FRONT", OrderProjectionFixtures.A3SizeId, "A3", "A3",
                notes: string.Join(" ", Enumerable.Repeat("overflow", 4000))),
        }));

    private static OrderDto ManyProductsOrder(int products)
    {
        var items = Enumerable.Range(0, products)
            .SelectMany(p => new[]
            {
                OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(6000 + p * 2), "Black / M", quantity: p + 1,
                    productId: OrderProjectionFixtures.Id(7000 + p),
                    productName: $"Product {p:00} — long descriptive garment name for wrapping",
                    variantId: OrderProjectionFixtures.Id(8000 + p * 2)),
                OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(6001 + p * 2), "White / L", quantity: p + 2,
                    productId: OrderProjectionFixtures.Id(7000 + p),
                    productName: $"Product {p:00} — long descriptive garment name for wrapping",
                    variantId: OrderProjectionFixtures.Id(8001 + p * 2)),
            })
            .ToArray();

        return OrderProjectionFixtures.Order(items);
    }
}
