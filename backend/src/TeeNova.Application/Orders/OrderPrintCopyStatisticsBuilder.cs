using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Builds exact print-copy groups and an operator-friendly print-size roll-up from an immutable
/// <see cref="OrderDto"/> snapshot (Jira 10106). Pure and deterministic: no database, catalogue,
/// dependency injection, pricing, persistence, mutation or QuestPDF dependency.
/// </summary>
internal static partial class OrderPrintCopyStatisticsBuilder
{
    internal const string UnspecifiedPosition = "Unspecified position";
    internal const string UnspecifiedSize = "Unspecified size";

    public static OrderPrintCopyStatistics Build(OrderDto order)
    {
        ArgumentNullException.ThrowIfNull(order);

        var candidates = Candidates(order);
        if (candidates.Count == 0)
            return new OrderPrintCopyStatistics(0, Array.Empty<OrderPrintSizeTotal>(), Array.Empty<OrderPrintCopyGroup>());

        var groups = BuildDetailedGroups(candidates);
        var totals = BuildSizeTotals(candidates);
        var totalCopies = checked(candidates.Sum(candidate => candidate.Item.Quantity));

        return new OrderPrintCopyStatistics(totalCopies, totals, groups);
    }

    private static List<Candidate> Candidates(OrderDto order)
    {
        var candidates = new List<Candidate>();

        foreach (var item in order.Items ?? new List<OrderItemDto>())
        {
            // Only actual garment print memberships count. Badge/Banner dimensions and item-level
            // artwork are deliberately irrelevant.
            if (item.ProductKind != ProductKind.Garment || item.Prints is null)
                continue;

            foreach (var print in item.Prints)
            {
                var (colour, garmentSize) = OrderVariantLabelParser.ParseForDisplay(item.VariantLabel);
                var designIdentity = DesignIdentity(print);
                var designLabel = DesignLabel(print);

                candidates.Add(new Candidate(
                    new ExactGroupKey(designIdentity, print.PrintAreaId, print.PrintSizeId),
                    designIdentity,
                    designLabel,
                    print.UploadedAssetId,
                    BaseLabel(print.PrintAreaName, UnspecifiedPosition),
                    CleanCode(print.PrintAreaCode),
                    BaseLabel(print.PrintSizeName, UnspecifiedSize),
                    CleanCode(print.PrintSizeCode),
                    item,
                    print,
                    colour,
                    garmentSize));
            }
        }

        return candidates;
    }

    private static IReadOnlyList<OrderPrintCopyGroup> BuildDetailedGroups(IReadOnlyList<Candidate> candidates)
    {
        var grouped = candidates
            .GroupBy(candidate => candidate.Key)
            .Select(group => new MutableDetailedGroup(group.Key, group.ToList()))
            .ToList();

        DisambiguateDesignLabels(grouped);
        DisambiguateAreaLabels(grouped);
        DisambiguateSizeLabels(grouped);

        return grouped
            .Select(group => group.ToProjection())
            .OrderBy(group => group.DesignLabel, StringComparer.OrdinalIgnoreCase)
            .ThenBy(group => group.DesignLabel, StringComparer.Ordinal)
            .ThenBy(group => group.DesignKey, StringComparer.Ordinal)
            .ThenBy(group => group.PrintAreaLabel, StringComparer.OrdinalIgnoreCase)
            .ThenBy(group => group.PrintAreaLabel, StringComparer.Ordinal)
            .ThenBy(group => group.PrintAreaId.ToString("N"), StringComparer.Ordinal)
            .ThenBy(group => group.IsStandardASize ? 0
                : group.PrintSizeLabel.StartsWith(UnspecifiedSize, StringComparison.Ordinal) ? 2 : 1)
            .ThenBy(group => group.IsStandardASize ? -group.ASizeNumber!.Value : int.MaxValue)
            .ThenBy(group => group.PrintSizeLabel, StringComparer.OrdinalIgnoreCase)
            .ThenBy(group => group.PrintSizeLabel, StringComparer.Ordinal)
            .ThenBy(group => group.PrintSizeId.ToString("N"), StringComparer.Ordinal)
            .ThenBy(group => group.SourceOrderItemPrintIds[0].ToString("N"), StringComparer.Ordinal)
            .ToList();
    }

    private static IReadOnlyList<OrderPrintSizeTotal> BuildSizeTotals(IReadOnlyList<Candidate> candidates)
    {
        var buckets = candidates
            .GroupBy(candidate => SummaryKey(candidate))
            .Select(group =>
            {
                var first = group
                    .OrderBy(candidate => candidate.Print.PrintSizeId.ToString("N"), StringComparer.Ordinal)
                    .ThenBy(candidate => candidate.Print.Id.ToString("N"), StringComparer.Ordinal)
                    .First();
                var sourceIds = group.Select(candidate => candidate.Print.PrintSizeId)
                    .Distinct()
                    .OrderBy(id => id.ToString("N"), StringComparer.Ordinal)
                    .ToList();
                var aSize = StandardASizeNumber(first.SizeBaseLabel);
                var unspecified = first.SizeBaseLabel == UnspecifiedSize;

                return new MutableSizeTotal(
                    group.Key,
                    aSize is int number ? $"A{number}" : first.SizeBaseLabel,
                    checked(group.Sum(candidate => candidate.Item.Quantity)),
                    sourceIds,
                    sourceIds.Count > 1,
                    aSize.HasValue,
                    aSize,
                    unspecified);
            })
            .ToList();

        // Custom records with identical visible labels stay separate and receive a controlled,
        // operator-facing disambiguator. Standard A-size and unspecified buckets may intentionally
        // combine ids and instead expose that fact through CombinesMultipleSizeRecords.
        foreach (var bucket in buckets
                     .Where(total => !total.IsStandardASize && !total.IsUnspecified)
                     .GroupBy(total => total.DisplayLabel, StringComparer.OrdinalIgnoreCase)
                     .Where(bucket => bucket.Count() > 1))
        {
            var ordered = bucket
                .OrderBy(total => total.CanonicalSizeKey, StringComparer.Ordinal)
                .ToList();
            for (var i = 0; i < ordered.Count; i++)
                ordered[i].DisplayLabel = $"{ordered[i].DisplayLabel} — Size {i + 1} of {ordered.Count}";
        }

        return buckets
            .OrderBy(total => total.IsStandardASize ? 0 : total.IsUnspecified ? 2 : 1)
            .ThenBy(total => total.IsStandardASize ? -total.ASizeNumber!.Value : int.MaxValue)
            .ThenBy(total => total.DisplayLabel, StringComparer.OrdinalIgnoreCase)
            .ThenBy(total => total.DisplayLabel, StringComparer.Ordinal)
            .ThenBy(total => total.CanonicalSizeKey, StringComparer.Ordinal)
            .Select(total => total.ToProjection())
            .ToList();
    }

    private static string SummaryKey(Candidate candidate)
    {
        if (StandardASizeNumber(candidate.SizeBaseLabel) is int number)
            return $"a:{number}";
        if (candidate.SizeBaseLabel == UnspecifiedSize)
            return "unspecified";

        // A custom size is exact by PrintSizeId even when another record has the same visible label.
        return $"custom:{candidate.Print.PrintSizeId:N}";
    }

    private static void DisambiguateDesignLabels(IReadOnlyList<MutableDetailedGroup> groups)
    {
        foreach (var bucket in groups
                     .GroupBy(group => group.DesignLabel, StringComparer.OrdinalIgnoreCase)
                     .Where(bucket => bucket.Select(group => group.Key.DesignIdentity).Distinct().Count() > 1))
        {
            var identities = bucket.Select(group => group.Key.DesignIdentity)
                .Distinct()
                .OrderBy(value => value, StringComparer.Ordinal)
                .ToList();

            foreach (var group in bucket)
            {
                var index = identities.IndexOf(group.Key.DesignIdentity);
                group.DesignLabel = $"{group.DesignLabel} — Design {index + 1} of {identities.Count}";
            }
        }
    }

    private static void DisambiguateAreaLabels(IReadOnlyList<MutableDetailedGroup> groups)
        => DisambiguateExactLabels(
            groups,
            group => group.AreaLabel,
            group => group.Key.PrintAreaId,
            group => group.AreaCode,
            (group, value) => group.AreaLabel = value,
            "Position");

    private static void DisambiguateSizeLabels(IReadOnlyList<MutableDetailedGroup> groups)
        => DisambiguateExactLabels(
            groups,
            group => group.SizeLabel,
            group => group.Key.PrintSizeId,
            group => group.SizeCode,
            (group, value) => group.SizeLabel = value,
            "Size");

    private static void DisambiguateExactLabels(
        IReadOnlyList<MutableDetailedGroup> groups,
        Func<MutableDetailedGroup, string> label,
        Func<MutableDetailedGroup, Guid> identity,
        Func<MutableDetailedGroup, string?> code,
        Action<MutableDetailedGroup, string> assign,
        string noun)
    {
        foreach (var bucket in groups
                     .GroupBy(label, StringComparer.OrdinalIgnoreCase)
                     .Where(bucket => bucket.Select(identity).Distinct().Count() > 1))
        {
            var records = bucket
                .GroupBy(identity)
                .Select(record => new
                {
                    Id = record.Key,
                    Code = record.Select(code).Where(value => value is not null)
                        .Cast<string>()
                        .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(value => value, StringComparer.Ordinal)
                        .FirstOrDefault(),
                })
                .OrderBy(record => record.Id.ToString("N"), StringComparer.Ordinal)
                .ToList();

            var codesAreUseful = records.All(record => !string.IsNullOrWhiteSpace(record.Code))
                                 && records.Select(record => record.Code)
                                     .Distinct(StringComparer.OrdinalIgnoreCase).Count() == records.Count;

            foreach (var group in bucket)
            {
                var recordIndex = records.FindIndex(record => record.Id == identity(group));
                var suffix = codesAreUseful
                    ? $" ({records[recordIndex].Code})"
                    : $" — {noun} {recordIndex + 1} of {records.Count}";
                assign(group, label(group) + suffix);
            }
        }
    }

    private static string DesignIdentity(OrderItemPrintDto print)
    {
        var assetIdentity = print.UploadedAssetId is Guid assetId
            ? $"asset:{assetId:N}"
            : !string.IsNullOrWhiteSpace(print.UploadedAssetUrl)
                ? $"url:{StableHash(print.UploadedAssetUrl.Trim())}"
                : "no-asset";
        return $"{assetIdentity}|note:{StableHash(CleanText(print.DesignNote) ?? string.Empty)}";
    }

    private static string DesignLabel(OrderItemPrintDto print)
    {
        var designName = OrderDesignNameResolver.Resolve(print.UploadedAssetUrl).DesignName;
        var note = CleanText(print.DesignNote);
        return note is null ? designName : $"{designName} — {note}";
    }

    private static string StableHash(string value)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string BaseLabel(string? value, string fallback)
        => CleanText(value) ?? fallback;

    private static string? CleanCode(string? value) => CleanText(value);

    private static string? CleanText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        return RepeatedWhitespace().Replace(value.Trim(), " ");
    }

    private static int? StandardASizeNumber(string label)
    {
        var match = StandardASize().Match(label);
        if (!match.Success || !int.TryParse(match.Groups[1].Value, out var number))
            return null;
        return number is >= 0 and <= 10 ? number : null;
    }

    [GeneratedRegex(@"^A\s*(\d+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex StandardASize();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex RepeatedWhitespace();

    private readonly record struct ExactGroupKey(string DesignIdentity, Guid PrintAreaId, Guid PrintSizeId);

    private sealed record Candidate(
        ExactGroupKey Key,
        string DesignIdentity,
        string DesignBaseLabel,
        Guid? UploadedAssetId,
        string AreaBaseLabel,
        string? AreaCode,
        string SizeBaseLabel,
        string? SizeCode,
        OrderItemDto Item,
        OrderItemPrintDto Print,
        string Colour,
        string GarmentSize);

    private sealed class MutableDetailedGroup
    {
        public MutableDetailedGroup(ExactGroupKey key, List<Candidate> candidates)
        {
            Key = key;
            Candidates = candidates;
            DesignLabel = Select(candidates, candidate => candidate.DesignBaseLabel);
            AreaLabel = Select(candidates, candidate => candidate.AreaBaseLabel);
            AreaCode = SelectNullable(candidates, candidate => candidate.AreaCode);
            SizeLabel = Select(candidates, candidate => candidate.SizeBaseLabel);
            SizeCode = SelectNullable(candidates, candidate => candidate.SizeCode);
        }

        public ExactGroupKey Key { get; }
        public List<Candidate> Candidates { get; }
        public string DesignLabel { get; set; }
        public string AreaLabel { get; set; }
        public string? AreaCode { get; }
        public string SizeLabel { get; set; }
        public string? SizeCode { get; }

        public OrderPrintCopyGroup ToProjection()
        {
            var memberships = Candidates
                .OrderBy(candidate => candidate.Print.Id.ToString("N"), StringComparer.Ordinal)
                .ThenBy(candidate => candidate.Item.Id.ToString("N"), StringComparer.Ordinal)
                .Select(candidate => new OrderPrintCopyMembership(
                    candidate.Item.Id,
                    candidate.Print.Id,
                    candidate.Item.Quantity,
                    BaseLabel(candidate.Item.ProductName, OrderProductGroupRowFormatter.UnnamedProduct),
                    candidate.Colour,
                    candidate.GarmentSize,
                    CleanText(candidate.Print.Notes)))
                .ToList();

            var baseSizeLabel = Select(Candidates, candidate => candidate.SizeBaseLabel);
            var aSizeNumber = StandardASizeNumber(baseSizeLabel);

            return new OrderPrintCopyGroup(
                Key.DesignIdentity,
                DesignLabel,
                Candidates.Select(candidate => candidate.UploadedAssetId)
                    .Where(id => id.HasValue).Select(id => id!.Value).OrderBy(id => id.ToString("N"), StringComparer.Ordinal)
                    .Cast<Guid?>().FirstOrDefault(),
                Key.PrintAreaId,
                AreaLabel,
                Key.PrintSizeId,
                SizeLabel,
                aSizeNumber.HasValue,
                aSizeNumber,
                checked(memberships.Sum(membership => membership.Quantity)),
                memberships.Select(membership => membership.SourceOrderItemId)
                    .Distinct().OrderBy(id => id.ToString("N"), StringComparer.Ordinal).ToList(),
                memberships.Select(membership => membership.SourceOrderItemPrintId).ToList(),
                memberships);
        }

        private static string Select(IEnumerable<Candidate> candidates, Func<Candidate, string> selector)
            => candidates.Select(selector)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .ThenBy(value => value, StringComparer.Ordinal)
                .First();

        private static string? SelectNullable(IEnumerable<Candidate> candidates, Func<Candidate, string?> selector)
            => candidates.Select(selector).Where(value => value is not null).Cast<string>()
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .ThenBy(value => value, StringComparer.Ordinal)
                .FirstOrDefault();
    }

    private sealed class MutableSizeTotal
    {
        public MutableSizeTotal(
            string canonicalSizeKey,
            string displayLabel,
            int copyCount,
            IReadOnlyList<Guid> sourcePrintSizeIds,
            bool combinesMultipleSizeRecords,
            bool isStandardASize,
            int? aSizeNumber,
            bool isUnspecified)
        {
            CanonicalSizeKey = canonicalSizeKey;
            DisplayLabel = displayLabel;
            CopyCount = copyCount;
            SourcePrintSizeIds = sourcePrintSizeIds;
            CombinesMultipleSizeRecords = combinesMultipleSizeRecords;
            IsStandardASize = isStandardASize;
            ASizeNumber = aSizeNumber;
            IsUnspecified = isUnspecified;
        }

        public string CanonicalSizeKey { get; }
        public string DisplayLabel { get; set; }
        public int CopyCount { get; }
        public IReadOnlyList<Guid> SourcePrintSizeIds { get; }
        public bool CombinesMultipleSizeRecords { get; }
        public bool IsStandardASize { get; }
        public int? ASizeNumber { get; }
        public bool IsUnspecified { get; }

        public OrderPrintSizeTotal ToProjection()
            => new(
                CanonicalSizeKey,
                DisplayLabel,
                CopyCount,
                SourcePrintSizeIds,
                CombinesMultipleSizeRecords,
                IsStandardASize,
                ASizeNumber,
                IsUnspecified);
    }
}
