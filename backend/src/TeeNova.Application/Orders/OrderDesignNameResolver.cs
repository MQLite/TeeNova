using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace TeeNova.Orders;

/// <summary>
/// Pure, deterministic derivation of a display "design name" from an order print's uploaded asset URL
/// (Jira 9403). No DB access, no side effects.
///
/// This intentionally mirrors the production PDF's <c>OrderProductionPdfService.DesignDisplayName</c>
/// derivation: take the final path segment of the URL (dropping scheme/host/query/fragment and any
/// Windows path), URL-decode it, then strip the storage-generated upload prefix
/// (<c>{prefix}_{yyyyMMdd}_{6 chars}_</c>) so the same artwork re-uploaded for each placement collapses
/// to one design. The PDF rendering is deliberately left untouched in 9403; if a shared helper is later
/// adopted by the PDF it must be a verified pure-function relocation.
/// </summary>
public static class OrderDesignNameResolver
{
    /// <summary>Display name used when no usable design filename can be derived.</summary>
    public const string NoDesignName = "No design uploaded";

    /// <summary>Group key sentinel used when no usable design filename can be derived.</summary>
    public const string NoDesignKey = "(no-design)";

    // Same pattern as OrderProductionPdfService.GeneratedFilePrefix: "{prefix}_{yyyyMMdd}_{6 chars}_".
    private static readonly Regex GeneratedFilePrefix =
        new(@"^[A-Za-z]+_\d{8}_[0-9A-Za-z]{6}_", RegexOptions.Compiled);

    /// <summary>
    /// Resolves a (DesignName, DesignKey) pair from the print's uploaded asset URL.
    /// Falls back to (<see cref="NoDesignName"/>, <see cref="NoDesignKey"/>) when no usable filename exists.
    /// DesignKey is the lower-cased, trimmed design name (so it is stable for grouping).
    /// </summary>
    public static (string DesignName, string DesignKey) Resolve(string? uploadedAssetUrl)
    {
        var label = FileLabel(uploadedAssetUrl);
        if (label == null)
            return (NoDesignName, NoDesignKey);

        var name = GeneratedFilePrefix.Replace(label, string.Empty).Trim();
        if (name.Length == 0)
            name = label; // prefix stripping consumed everything — keep the raw filename instead

        var key = name.Trim().ToLowerInvariant();
        if (key.Length == 0)
            return (NoDesignName, NoDesignKey);

        return (name, key);
    }

    /// <summary>
    /// Returns the safe final filename segment of a URL/path (decoded), or null when none is usable.
    /// Never returns a scheme, host, query, fragment, or directory component.
    /// </summary>
    private static string? FileLabel(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return null;

        var path = url.Trim();

        if (Uri.TryCreate(path, UriKind.Absolute, out var abs))
        {
            // AbsolutePath excludes scheme, host, query and fragment.
            path = abs.AbsolutePath;
        }
        else
        {
            var hashIdx = path.IndexOf('#');
            if (hashIdx >= 0) path = path[..hashIdx];
            var queryIdx = path.IndexOf('?');
            if (queryIdx >= 0) path = path[..queryIdx];
        }

        var tail = path
            .Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries)
            .LastOrDefault();

        if (string.IsNullOrWhiteSpace(tail))
            return null;

        try { tail = Uri.UnescapeDataString(tail); } catch { /* keep raw tail */ }
        tail = tail.Trim();

        return tail.Length == 0 ? null : tail;
    }
}
