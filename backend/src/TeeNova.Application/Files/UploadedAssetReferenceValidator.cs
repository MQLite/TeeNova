using System;

namespace TeeNova.Files;

/// <summary>
/// Safety rules for customer-supplied uploaded-asset URL references accepted at public/anonymous
/// endpoints (checkout, banner enquiry) — Jira 9808.
///
/// A design reference must resolve to a file THIS shop stored, exposed as a root-relative
/// <c>/uploads/…</c> path by <c>LocalFileStorageService</c>. Anything else (an absolute external URL, a
/// protocol-relative <c>//host</c> URL, a <c>javascript:</c>/<c>data:</c>/<c>file:</c>/<c>ftp:</c> scheme,
/// or a path-traversal attempt) is rejected so a customer can never attach an arbitrary external
/// tracking/image URL to an order or have such a URL rendered on an admin/success page as if it were a
/// trusted design asset. The server never fetches these URLs; they are only stored and later served from
/// the shop's own <c>/uploads</c> origin.
/// </summary>
public static class UploadedAssetReferenceValidator
{
    private const string UploadsPrefix = "/uploads/";

    /// <summary>
    /// True only for a safe, root-relative internal upload path (<c>/uploads/…</c>) with no scheme,
    /// no host, and no path-traversal segment.
    /// </summary>
    public static bool IsSafeInternalAssetUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return false;

        var value = url.Trim();

        // Must be a root-relative path under /uploads/. This rejects every absolute URL (http/https/ftp/
        // file), every custom scheme (javascript:, data:), and protocol-relative //host forms in one shot,
        // since none of those begin with a single leading slash followed by "uploads/".
        if (!value.StartsWith(UploadsPrefix, StringComparison.OrdinalIgnoreCase))
            return false;

        // Defense in depth: no scheme separators, no protocol-relative prefix, no backslashes, and no
        // traversal segments that could escape the uploads root once resolved to a local path.
        if (value.StartsWith("//", StringComparison.Ordinal)) return false;
        if (value.Contains("://", StringComparison.Ordinal))   return false;
        if (value.Contains('\\'))                              return false;
        if (value.Contains(".."))                              return false;

        return true;
    }

    /// <summary>
    /// Normalizes an optional customer-supplied URL: returns null for blank input, the trimmed value when
    /// it is a safe internal reference, and throws <see cref="Volo.Abp.BusinessException"/> otherwise.
    /// </summary>
    public static string? NormalizeOrThrow(string? url, string errorCode)
    {
        if (string.IsNullOrWhiteSpace(url))
            return null;

        var value = url.Trim();
        if (!IsSafeInternalAssetUrl(value))
            throw new Volo.Abp.BusinessException(errorCode).WithData("UploadedAssetUrl", value);

        return value;
    }
}
