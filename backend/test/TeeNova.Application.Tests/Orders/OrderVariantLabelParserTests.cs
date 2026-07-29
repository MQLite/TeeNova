namespace TeeNova.Orders;

/// <summary>
/// The single shared variant-label parser (Jira 9403, consolidated in Jira 10103). These cases pin the
/// documented null/blank policy: an absent part is null from <c>Parse</c> and empty from
/// <c>ParseForDisplay</c> — never fabricated, never throwing.
/// </summary>
public sealed class OrderVariantLabelParserTests
{
    [Theory]
    // label,                    expected colour,   expected size
    [InlineData("Black / M", "Black", "M")]
    [InlineData("  Black / M  ", "Black", "M")]           // outer whitespace trimmed
    [InlineData("Navy / White / XL", "Navy / White", "XL")] // LAST delimiter wins
    [InlineData("A / B / C / D", "A / B / C", "D")]
    [InlineData("OneSize", "OneSize", null)]              // no delimiter -> all colour
    [InlineData("Black/M", "Black/M", null)]              // delimiter needs the surrounding spaces
    [InlineData("Black  /  M", "Black", "M")]             // matches the LAST " / "; each part trimmed
    // The outer trim happens FIRST, so an edge delimiter stops being a delimiter and the malformed
    // label is reported verbatim as the colour rather than being repaired.
    [InlineData(" / M", "/ M", null)]
    [InlineData("Black / ", "Black /", null)]
    [InlineData(" / ", "/", null)]
    [InlineData("", null, null)]
    [InlineData("   ", null, null)]
    [InlineData(null, null, null)]
    public void Parse_reports_absent_parts_as_null_and_never_fabricates(string? label, string? colour, string? size)
    {
        var (parsedColour, parsedSize) = OrderVariantLabelParser.Parse(label);

        Assert.Equal(colour, parsedColour);
        Assert.Equal(size, parsedSize);
    }

    [Theory]
    [InlineData("Black / M", "Black", "M")]
    [InlineData("Navy / White / XL", "Navy / White", "XL")]
    [InlineData("OneSize", "OneSize", "")]
    [InlineData(" / M", "/ M", "")]
    [InlineData("Black / ", "Black /", "")]
    [InlineData("", "", "")]
    [InlineData("   ", "", "")]
    [InlineData(null, "", "")]
    public void ParseForDisplay_projects_absent_parts_to_empty_strings(string? label, string colour, string size)
    {
        var (parsedColour, parsedSize) = OrderVariantLabelParser.ParseForDisplay(label);

        Assert.Equal(colour, parsedColour);
        Assert.Equal(size, parsedSize);
    }

    [Fact]
    public void Both_entry_points_agree_on_the_split_position()
    {
        var (colour, size) = OrderVariantLabelParser.Parse("Navy / White / XL");
        var (displayColour, displaySize) = OrderVariantLabelParser.ParseForDisplay("Navy / White / XL");

        Assert.Equal(colour, displayColour);
        Assert.Equal(size, displaySize);
    }
}
