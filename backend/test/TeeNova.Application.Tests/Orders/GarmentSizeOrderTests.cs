using System;
using System.Linq;

namespace TeeNova.Orders;

/// <summary>
/// The shared apparel-size ordering extracted from the production sheet (Jira 10103). These cases pin
/// the ORIGINAL semantics: canonical sequence, "2XL"-style normalisation, numeric children's sizes,
/// unknown names, and blank/null last.
/// </summary>
public sealed class GarmentSizeOrderTests
{
    [Fact]
    public void Ranks_the_canonical_apparel_sequence_in_order()
    {
        var canonical = new[] { "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL", "XXXXXXL" };

        var ranks = canonical.Select(GarmentSizeOrder.Rank).ToArray();

        Assert.Equal(ranks.OrderBy(r => r).ToArray(), ranks);
        Assert.Equal(0, ranks[0]);
        Assert.Equal(canonical.Length - 1, ranks[^1]);
    }

    [Theory]
    [InlineData("2XL", "XXL")]
    [InlineData("3XL", "XXXL")]
    [InlineData("4XL", "XXXXL")]
    [InlineData("2 XL", "XXL")]   // the regex accepts optional spaces
    [InlineData("3  XL", "XXXL")]
    [InlineData("xxl", "XXL")]    // case-insensitive
    [InlineData(" m ", "M")]      // trimmed
    public void Normalises_numeric_xl_and_casing_to_the_canonical_size(string input, string canonical)
        => Assert.Equal(GarmentSizeOrder.Rank(canonical), GarmentSizeOrder.Rank(input));

    [Fact]
    public void Ranks_numeric_childrens_sizes_after_letter_sizes_and_in_numeric_order()
    {
        Assert.True(GarmentSizeOrder.Rank("XXXXXXL") < GarmentSizeOrder.Rank("0"));
        Assert.True(GarmentSizeOrder.Rank("2") < GarmentSizeOrder.Rank("8"));
        Assert.True(GarmentSizeOrder.Rank("8") < GarmentSizeOrder.Rank("10"));
        Assert.Equal(10_008, GarmentSizeOrder.Rank("8"));
    }

    [Fact]
    public void Ranks_unknown_named_sizes_after_numeric_but_before_missing()
    {
        Assert.Equal(GarmentSizeOrder.UnknownNamedRank, GarmentSizeOrder.Rank("One Size"));
        Assert.Equal(GarmentSizeOrder.UnknownNamedRank, GarmentSizeOrder.Rank("Tall"));
        Assert.True(GarmentSizeOrder.Rank("10") < GarmentSizeOrder.Rank("One Size"));
        Assert.True(GarmentSizeOrder.Rank("One Size") < GarmentSizeOrder.Rank(""));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Ranks_blank_and_null_sizes_last(string? size)
        => Assert.Equal(GarmentSizeOrder.MissingRank, GarmentSizeOrder.Rank(size));

    [Fact]
    public void Ties_are_stable_so_callers_can_apply_a_secondary_alphabetical_sort()
    {
        // Every unknown named size shares one rank by design; the caller breaks the tie by label.
        Assert.Equal(GarmentSizeOrder.Rank("Tall"), GarmentSizeOrder.Rank("One Size"));

        var sorted = new[] { "Tall", "One Size", "M", "", "10", "XS" }
            .OrderBy(GarmentSizeOrder.Rank)
            .ThenBy(s => s, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        Assert.Equal(new[] { "XS", "M", "10", "One Size", "Tall", "" }, sorted);
    }

    [Fact]
    public void Sorting_is_culture_independent()
    {
        // "1XL" is NOT normalised (the original required a count >= 2), so it stays an unknown name.
        Assert.Equal(GarmentSizeOrder.UnknownNamedRank, GarmentSizeOrder.Rank("1XL"));
        Assert.Equal(GarmentSizeOrder.Rank("XL"), GarmentSizeOrder.Rank("xl"));
    }
}
