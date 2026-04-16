using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
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
/// </summary>
public class LocalFileStorageService : IFileStorageService
{
    private readonly string _uploadsRoot;   // wwwroot/uploads
    private readonly string _baseUrl;

    public LocalFileStorageService(IConfiguration configuration, IHostEnvironment env)
    {
        _uploadsRoot = Path.Combine(env.ContentRootPath, "wwwroot", "uploads");
        _baseUrl = configuration["App:SelfUrl"] ?? "https://localhost:44300";
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

        return $"{_baseUrl}/uploads/{folder}/{uniqueFileName}";
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
    /// Handles both the old flat layout (/uploads/{file}) and
    /// the new folder layout (/uploads/{folder}/{file}).
    /// </summary>
    private string ResolveLocalPath(string fileUrl)
    {
        var uri = new Uri(fileUrl);
        var absPath = uri.AbsolutePath;           // e.g. /uploads/designs/abc_file.png

        // Strip the leading /uploads/ prefix to get the relative path within _uploadsRoot
        const string uploadsPrefix = "/uploads/";
        if (absPath.StartsWith(uploadsPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var relative = absPath[uploadsPrefix.Length..];   // designs/abc_file.png  OR  abc_file.png
            return Path.Combine(_uploadsRoot, relative.Replace('/', Path.DirectorySeparatorChar));
        }

        // Fallback: just use the filename (legacy flat layout)
        return Path.Combine(_uploadsRoot, Path.GetFileName(absPath));
    }

    private static string BuildStandardizedFileName(string? fileNamePrefix, string originalFileName)
    {
        var prefix = string.IsNullOrWhiteSpace(fileNamePrefix)
            ? "order-unassigned_item-unassigned"
            : fileNamePrefix.Trim();

        var extension = Path.GetExtension(originalFileName);
        var safeExtension = string.IsNullOrWhiteSpace(extension)
            ? string.Empty
            : extension.ToLowerInvariant();

        var baseName = Path.GetFileNameWithoutExtension(originalFileName);
        var sanitizedName = SanitizeFileNameSegment(baseName);
        var uniqueSuffix = Guid.NewGuid().ToString("N")[..6];

        return $"{prefix}_{sanitizedName}_{uniqueSuffix}{safeExtension}";
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
