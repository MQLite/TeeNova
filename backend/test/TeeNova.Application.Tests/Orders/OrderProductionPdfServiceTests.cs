using System;
using System.IO;
using System.Security.Cryptography;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Narrow preservation tests for the production sheet (Jira 10103). They assert the CURRENT contract —
/// the service generates a non-empty PDF for representative orders, keeps its filename/content-type
/// contract, reads the order exactly once and touches no catalogue — so the shared-helper extraction
/// cannot silently change behaviour. Layout itself is asserted through the extracted pure helpers
/// (see <c>OrderProductionPdfOrderingTests</c>); nothing here searches compressed PDF bytes for text.
/// </summary>
public sealed class OrderProductionPdfServiceTests
{
    /// <summary>Set TEENOVA_PDF_BASELINE_DIR to dump bytes + SHA-256 for a before/after comparison.</summary>
    private static readonly string? BaselineDir = Environment.GetEnvironmentVariable("TEENOVA_PDF_BASELINE_DIR");

    private static async Task<(byte[] Bytes, OrderProductionPdfResult Result, FakeOrderAppService Fake)> GenerateAsync(
        OrderDto order, string name)
    {
        var fake = new FakeOrderAppService(order);
        var service = new OrderProductionPdfService(fake);

        var result = await service.GenerateAsync(order.Id);

        if (!string.IsNullOrWhiteSpace(BaselineDir))
        {
            Directory.CreateDirectory(BaselineDir!);
            await File.WriteAllBytesAsync(Path.Combine(BaselineDir!, $"{name}.pdf"), result.Content);
            var hash = Convert.ToHexString(SHA256.HashData(result.Content));
            await File.WriteAllTextAsync(
                Path.Combine(BaselineDir!, $"{name}.sha256.txt"),
                $"{hash}  bytes={result.Content.Length}  file={result.FileName}");
        }

        return (result.Content, result, fake);
    }

    [Fact]
    public async Task Generates_a_non_empty_pdf_for_a_garment_order()
    {
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / L", quantity: 2));

        var (bytes, _, _) = await GenerateAsync(order, "garment-order");

        Assert.NotEmpty(bytes);
        Assert.True(bytes.Length > 1000, $"Expected a real PDF, got {bytes.Length} bytes.");
        Assert.Equal(new byte[] { 0x25, 0x50, 0x44, 0x46 }, bytes[..4]); // "%PDF"
    }

    [Fact]
    public async Task Generates_a_non_empty_pdf_for_a_mixed_garment_badge_and_banner_order()
    {
        var (bytes, _, _) = await GenerateAsync(OrderProjectionFixtures.MixedOrder(), "mixed-order");

        Assert.NotEmpty(bytes);
        Assert.Equal(new byte[] { 0x25, 0x50, 0x44, 0x46 }, bytes[..4]);
    }

    [Fact]
    public async Task Generates_a_pdf_for_a_banner_with_custom_dimensions_and_for_a_badge_only_order()
    {
        var banner = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(
                OrderProjectionFixtures.Id(20),
                detail: OrderProjectionFixtures.CustomBannerDetail()));
        var badgeOnly = OrderProjectionFixtures.Order(OrderProjectionFixtures.Badge(OrderProjectionFixtures.Id(21)));

        var (bannerBytes, _, _) = await GenerateAsync(banner, "custom-banner-order");
        var (badgeBytes, _, _) = await GenerateAsync(badgeOnly, "badge-only-order");

        Assert.NotEmpty(bannerBytes);
        Assert.NotEmpty(badgeBytes);
    }

    [Fact]
    public async Task Generates_a_pdf_for_an_order_whose_items_carry_no_prints_and_no_variant_label()
    {
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(
                OrderProjectionFixtures.Id(30), variantLabel: null, prints: Array.Empty<OrderItemPrintDto>()));

        var (bytes, _, _) = await GenerateAsync(order, "legacy-order");

        Assert.NotEmpty(bytes);
    }

    [Fact]
    public async Task Keeps_the_filename_and_content_type_contract()
    {
        var (_, result, _) = await GenerateAsync(OrderProjectionFixtures.MixedOrder(), "filename-contract");

        Assert.Equal("Order-ORD-10103-TEST-production-sheet.pdf", result.FileName);
        Assert.Equal("application/pdf", result.ContentType);
    }

    [Fact]
    public async Task Reads_the_order_snapshot_exactly_once_and_calls_no_other_service()
    {
        // FakeOrderAppService throws on every member except GetAsync, so a catalogue/pricing/repository
        // detour through the app service would fail this test rather than pass silently.
        var (_, _, fake) = await GenerateAsync(OrderProjectionFixtures.MixedOrder(), "single-read");

        Assert.Equal(1, fake.GetAsyncCallCount);
    }

    [Fact]
    public async Task Produces_the_same_byte_length_for_the_same_snapshot_generated_twice()
    {
        // Supporting signal only: the timestamp text is minute-granular and QuestPDF stamps its own
        // metadata, so byte equality is not asserted here (see the Jira 10103 report, §22).
        var (first, _, _) = await GenerateAsync(OrderProjectionFixtures.MixedOrder(), "stability-1");
        var (second, _, _) = await GenerateAsync(OrderProjectionFixtures.MixedOrder(), "stability-2");

        Assert.Equal(first.Length, second.Length);
    }
}
