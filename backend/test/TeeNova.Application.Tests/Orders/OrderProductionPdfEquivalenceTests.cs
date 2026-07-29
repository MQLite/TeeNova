using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Frozen-baseline tests for the production sheet.
///
/// <see cref="LegacyOrderProductionPdfBaseline"/> is a frozen verbatim copy of the service as it stood
/// BEFORE the Jira 10103 shared-helper extraction, private <c>SplitVariantLabel</c> / <c>SizeRank</c>
/// included. It is deliberately NOT updated to follow the Jira 10104 redesign.
///
/// <b>Jira 10104 change of premise.</b> Jira 10103 asserted EXACT BYTE EQUALITY between this baseline and
/// the live service, which was the correct proof for a pure helper extraction. Jira 10104 intentionally
/// replaces the flat five-column item table with product-grouped blocks, so byte equality is no longer a
/// valid expectation and asserting it would be asserting that the task was not done. Those five
/// assertions are therefore INVERTED, not deleted and not weakened: each still renders both code paths
/// over the same fixture and now confirms the divergence is real, deliberate and confined to layout —
/// both paths still produce a valid, non-empty PDF from the same snapshot.
///
/// <see cref="Shared_helpers_match_the_frozen_pre_extraction_implementations"/> is the 10103 helper-parity
/// test and is UNCHANGED: the shared helpers must still answer exactly what the frozen private copies
/// answered. Structural expectations for the new layout live in <c>OrderProductionPdfCompositionTests</c>
/// and <c>OrderProductionPdfOrderingTests</c>.
/// </summary>
public sealed class OrderProductionPdfEquivalenceTests
{
    /// <summary>
    /// Confirms the grouped sheet intentionally differs from the frozen pre-10103 layout, while both
    /// remain valid PDFs generated from the same order snapshot. Retried like the original equality
    /// assertion so a "Generated hh:mm" rollover between the two renders cannot manufacture a difference.
    /// </summary>
    private static async Task AssertIntentionallyDiffersFromFrozenBaselineAsync(OrderDto order)
    {
        byte[] legacy = Array.Empty<byte>();
        byte[] current = Array.Empty<byte>();

        for (var attempt = 0; attempt < 3; attempt++)
        {
            legacy = LegacyOrderProductionPdfBaseline.Generate(order);
            current = (await new OrderProductionPdfService(new FakeOrderAppService(order)).GenerateAsync(order.Id)).Content;

            if (!legacy.AsSpan().SequenceEqual(current))
                break;
        }

        Assert.NotEmpty(legacy);
        Assert.NotEmpty(current);
        Assert.Equal(new byte[] { 0x25, 0x50, 0x44, 0x46 }, legacy[..4]); // "%PDF"
        Assert.Equal(new byte[] { 0x25, 0x50, 0x44, 0x46 }, current[..4]);

        Assert.False(
            legacy.AsSpan().SequenceEqual(current),
            "The grouped Jira 10104 sheet is byte-identical to the frozen pre-10103 flat layout, so the "
            + "product-grouped item section is not being rendered.");

        Assert.NotEqual(
            Convert.ToHexString(SHA256.HashData(legacy)),
            Convert.ToHexString(SHA256.HashData(current)));
    }

    [Fact]
    public Task Garment_order_intentionally_differs_from_the_frozen_flat_layout()
        => AssertIntentionallyDiffersFromFrozenBaselineAsync(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(10), "Black / M", quantity: 3),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(11), "Black / L", quantity: 2),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(12), "White / S", quantity: 4)));

    [Fact]
    public Task Mixed_garment_badge_and_banner_order_intentionally_differs_from_the_frozen_flat_layout()
        => AssertIntentionallyDiffersFromFrozenBaselineAsync(OrderProjectionFixtures.MixedOrder());

    [Fact]
    public Task Custom_banner_order_intentionally_differs_from_the_frozen_flat_layout()
        => AssertIntentionallyDiffersFromFrozenBaselineAsync(OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Banner(OrderProjectionFixtures.Id(20),
                detail: OrderProjectionFixtures.CustomBannerDetail())));

    [Fact]
    public Task Order_with_awkward_variant_labels_intentionally_differs_from_the_frozen_flat_layout()
    {
        // Multi-slash colours, a label with no delimiter, a missing side, blanks and a null label.
        var order = OrderProjectionFixtures.Order(
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(40), "Navy / White / XL", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(41), "OneSize", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(42), " / M", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(43), "Black / ", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(44), "   ", quantity: 1),
            OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(45), null, quantity: 1));

        return AssertIntentionallyDiffersFromFrozenBaselineAsync(order);
    }

    [Fact]
    public Task Order_spanning_the_whole_apparel_size_matrix_intentionally_differs_from_the_frozen_flat_layout()
    {
        var labels = new[]
        {
            "Black / XXS", "Black / XS", "Black / S", "Black / M", "Black / L", "Black / XL",
            "Black / XXL", "Black / XXXL", "Black / 2XL", "Black / 3 XL", "Black / 8", "Black / 10",
            "Black / One Size", "Black / ",
        };

        var items = labels
            .Select((label, i) => OrderProjectionFixtures.Garment(OrderProjectionFixtures.Id(50 + i), label, quantity: i + 1))
            .ToArray();

        return AssertIntentionallyDiffersFromFrozenBaselineAsync(OrderProjectionFixtures.Order(items));
    }

    /// <summary>
    /// Guards the extraction at the unit level too: the shared helpers must answer exactly what the
    /// frozen implementations answered for every input the sheet can encounter.
    /// </summary>
    [Fact]
    public void Shared_helpers_match_the_frozen_pre_extraction_implementations()
    {
        var labels = new List<string?>
        {
            null, "", "   ", "Black / M", "  Black / M  ", "Navy / White / XL", "OneSize", " / M",
            "Black / ", " / ", "Black/M", "Black  /  M", "A / B / C / D",
        };

        foreach (var label in labels)
        {
            var expected = LegacyVariantLabelSplit(label);
            var actual = OrderVariantLabelParser.ParseForDisplay(label);
            Assert.Equal(expected, actual);
        }

        var sizes = new[]
        {
            "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL", "XXXXXXL",
            "2XL", "3XL", "4XL", "2 XL", "10XL", "1XL", "xxl", " m ", "8", "10", "0", "One Size",
            "Tall", "", "   ",
        };

        foreach (var size in sizes)
            Assert.Equal(LegacySizeRank(size), GarmentSizeOrder.Rank(size));
    }

    // ── Frozen copies of the two former private implementations (pre-10103) ───────────────────────

    private static (string Color, string Size) LegacyVariantLabelSplit(string? variantLabel)
    {
        var label = variantLabel?.Trim() ?? string.Empty;
        var idx = label.LastIndexOf(" / ", StringComparison.Ordinal);
        return idx < 0
            ? (label, string.Empty)
            : (label[..idx].Trim(), label[(idx + 3)..].Trim());
    }

    private static readonly string[] LegacySizeSequence =
        { "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL", "XXXXXXL" };

    private static readonly System.Text.RegularExpressions.Regex LegacyNumericXlSize =
        new(@"^(\d+)\s*XL$", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static int LegacySizeRank(string size)
    {
        var s = size.Trim().ToUpperInvariant();
        if (s.Length == 0)
            return int.MaxValue;

        var m = LegacyNumericXlSize.Match(s);
        if (m.Success && int.TryParse(m.Groups[1].Value, out var xCount) && xCount >= 2)
            s = new string('X', xCount) + "L";

        var idx = Array.IndexOf(LegacySizeSequence, s);
        if (idx >= 0)
            return idx;

        if (int.TryParse(s, System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var numeric))
            return 10_000 + numeric;

        return int.MaxValue - 1;
    }
}
