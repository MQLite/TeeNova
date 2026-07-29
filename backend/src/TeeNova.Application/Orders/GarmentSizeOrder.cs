using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace TeeNova.Orders;

/// <summary>
/// Pure, deterministic apparel-size ordering (Jira 10103). Extracted VERBATIM from the production
/// sheet's former private <c>OrderProductionPdfService.SizeRank</c> so the sheet and the new
/// <see cref="OrderProductGroupBuilder"/> sequence garment sizes identically. No DB access, no
/// side effects, no culture dependence.
///
/// Ranking, lowest first:
/// <list type="number">
///   <item>Known apparel sizes in their natural sequence (XXS … 6XL), with "2XL"/"3XL" style values
///         normalised to "XXL"/"XXXL" (optional space accepted, e.g. "2 XL").</item>
///   <item>Purely numeric children's sizes in numeric order (ranked at 10000 + n).</item>
///   <item>Any other named size (single rank; callers apply a secondary alphabetical sort).</item>
///   <item>Blank / whitespace-only / null size last.</item>
/// </list>
/// </summary>
public static class GarmentSizeOrder
{
    /// <summary>Rank of a blank, whitespace-only or null size — always last.</summary>
    public const int MissingRank = int.MaxValue;

    /// <summary>Rank of a non-blank size that matches no known pattern — after numeric, before blank.</summary>
    public const int UnknownNamedRank = int.MaxValue - 1;

    /// <summary>Canonical apparel size order used to sequence garment rows (index = rank).</summary>
    private static readonly string[] SizeSequence =
        { "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL", "XXXXXXL" };

    private static readonly Regex NumericXlSize = new(@"^(\d+)\s*XL$", RegexOptions.Compiled);

    /// <summary>
    /// Ranks a garment size for sorting. Accepts null (ranked <see cref="MissingRank"/>) so callers
    /// can pass a parsed size straight through without a null dance.
    /// </summary>
    public static int Rank(string? size)
    {
        var s = size?.Trim().ToUpperInvariant() ?? string.Empty;
        if (s.Length == 0)
            return MissingRank;

        var m = NumericXlSize.Match(s);
        if (m.Success && int.TryParse(m.Groups[1].Value, out var xCount) && xCount >= 2)
            s = new string('X', xCount) + "L";

        var idx = Array.IndexOf(SizeSequence, s);
        if (idx >= 0)
            return idx;

        // Kids/numeric sizes (e.g. "8", "10") after the letter sizes but in numeric order.
        if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric))
            return 10_000 + numeric;

        return UnknownNamedRank; // unknown named size: before blanks, alphabetised by the caller
    }
}
