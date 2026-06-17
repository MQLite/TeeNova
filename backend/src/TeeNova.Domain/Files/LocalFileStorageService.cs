using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;

namespace TeeNova.Files;

/// <summary>
/// Development-only local disk implementation.
/// Replace with AzureBlobStorageService or S3FileStorageService before production.
///
/// Layout:
///   {ContentRoot}/wwwroot/uploads/designs/   — customer print design files
///   {ContentRoot}/wwwroot/uploads/products/  — product catalog images
///
/// UseStaticFiles() serves the wwwroot tree, so both paths are publicly accessible.
/// Stored URLs are root-relative (/uploads/…) — domain-agnostic and safe across deployments.
/// </summary>
public class LocalFileStorageService : IFileStorageService
{
    private readonly string _uploadsRoot;   // wwwroot/uploads

    public LocalFileStorageService(IHostEnvironment env)
    {
        _uploadsRoot = Path.Combine(env.ContentRootPath, "wwwroot", "uploads");
    }

    public async Task<string> SaveAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        string folder,
        string? fileNamePrefix = null,
        CancellationToken cancellationToken = default)
    {
        var folderPath = Path.Combine(_uploadsRoot, folder);
        if (!Directory.Exists(folderPath))
            Directory.CreateDirectory(folderPath);

        var uniqueFileName = BuildStandardizedFileName(fileNamePrefix, fileName);
        var filePath = Path.Combine(folderPath, uniqueFileName);

        await using var fileStreamOut = new FileStream(filePath, FileMode.Create);
        await fileStream.CopyToAsync(fileStreamOut, cancellationToken);

        return $"/uploads/{folder}/{uniqueFileName}";
    }

    public Task DeleteAsync(string fileUrl, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveLocalPath(fileUrl);
        if (File.Exists(filePath))
            File.Delete(filePath);

        return Task.CompletedTask;
    }

    public Task<Stream> GetAsync(string fileUrl, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveLocalPath(fileUrl);
        Stream stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        return Task.FromResult(stream);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Converts a stored URL back to an absolute local file path.
    /// Handles:
    ///   - Root-relative paths: /uploads/{folder}/{file}  (new format)
    ///   - Absolute URLs:       https://host/uploads/{folder}/{file}  (legacy data)
    ///   - Old flat layout:     /uploads/{file}
    /// </summary>
    private string ResolveLocalPath(string fileUrl)
    {
        const string uploadsPrefix = "/uploads/";

        // New format: root-relative path starting with /uploads/
        if (fileUrl.StartsWith(uploadsPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var relative = fileUrl[uploadsPrefix.Length..];
            return Path.Combine(_uploadsRoot, relative.Replace('/', Path.DirectorySeparatorChar));
        }

        // Legacy format: absolute URL — extract the path component
        if (Uri.TryCreate(fileUrl, UriKind.Absolute, out var uri))
        {
            var absPath = uri.AbsolutePath;
            if (absPath.StartsWith(uploadsPrefix, StringComparison.OrdinalIgnoreCase))
            {
                var relative = absPath[uploadsPrefix.Length..];
                return Path.Combine(_uploadsRoot, relative.Replace('/', Path.DirectorySeparatorChar));
            }
            return Path.Combine(_uploadsRoot, Path.GetFileName(absPath));
        }

        // Unknown format — best-effort filename extraction
        return Path.Combine(_uploadsRoot, Path.GetFileName(fileUrl));
    }

    private static string BuildStandardizedFileName(string? fileNamePrefix, string originalFileName)
    {
        var prefix = ResolvePrefix(fileNamePrefix);

        var extension = Path.GetExtension(originalFileName);
        var safeExtension = string.IsNullOrWhiteSpace(extension)
            ? string.Empty
            : extension.ToLowerInvariant();

        var baseName = Path.GetFileNameWithoutExtension(originalFileName);
        var sanitizedName = SanitizeFileNameSegment(baseName);
        var dateStamp = DateTime.UtcNow.ToString("yyyyMMdd");
        var uniqueSuffix = Guid.NewGuid().ToString("N")[..6];

        return $"{prefix}_{dateStamp}_{uniqueSuffix}_{sanitizedName}{safeExtension}";
    }

    private static string ResolvePrefix(string? fileNamePrefix)
    {
        if (string.IsNullOrWhiteSpace(fileNamePrefix))
        {
            return "design";
        }

        var normalized = fileNamePrefix.Trim().ToLowerInvariant();
        return normalized switch
        {
            "designs" => "design",
            "products" => "product",
            _ => SanitizeFileNameSegment(normalized),
        };
    }

    private static string SanitizeFileNameSegment(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars().ToHashSet();
        var sanitized = new string(value
            .Trim()
            .ToLowerInvariant()
            .Select(ch =>
            {
                if (char.IsWhiteSpace(ch) || ch == '_')
                {
                    return '-';
                }

                return invalidChars.Contains(ch) || !char.IsLetterOrDigit(ch) && ch != '-' ? '-' : ch;
            })
            .ToArray());

        sanitized = string.Join("-",
            sanitized.Split('-', StringSplitOptions.RemoveEmptyEntries));

        if (string.IsNullOrWhiteSpace(sanitized))
        {
            sanitized = "file";
        }

        return sanitized.Length <= 50
            ? sanitized
            : sanitized[..50].Trim('-');
    }
}
