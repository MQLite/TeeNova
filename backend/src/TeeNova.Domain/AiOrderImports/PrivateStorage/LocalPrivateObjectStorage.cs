using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace TeeNova.AiOrderImports.PrivateStorage;

/// <summary>
/// Private local-disk object storage. It deliberately returns opaque object keys, never paths or URLs.
/// </summary>
public sealed partial class LocalPrivateObjectStorage : IPrivateObjectStorage
{
    private readonly string _rootPath;
    private readonly long _minimumFreeSpaceBytes;

    public LocalPrivateObjectStorage(
        IHostEnvironment environment,
        IOptions<PrivateObjectStorageOptions> options)
    {
        ArgumentNullException.ThrowIfNull(environment);
        ArgumentNullException.ThrowIfNull(options);

        var configuredRoot = options.Value.RootPath;
        if (string.IsNullOrWhiteSpace(configuredRoot))
        {
            throw new InvalidOperationException(
                $"{PrivateObjectStorageOptions.SectionName}:RootPath is required.");
        }

        var contentRoot = Path.GetFullPath(environment.ContentRootPath);
        _rootPath = Path.GetFullPath(
            Path.IsPathRooted(configuredRoot)
                ? configuredRoot
                : Path.Combine(contentRoot, configuredRoot));
        _minimumFreeSpaceBytes = Math.Max(0, options.Value.MinimumFreeSpaceBytes);

        var publicRoot = Path.GetFullPath(Path.Combine(contentRoot, "wwwroot"));
        if (IsSameOrDescendant(_rootPath, publicRoot))
        {
            throw new InvalidOperationException(
                "AI order private storage must resolve outside wwwroot.");
        }

        foreach (var forbidden in options.Value.ForbiddenPathPrefixes ?? [])
        {
            if (string.IsNullOrWhiteSpace(forbidden))
                continue;
            var resolved = Path.GetFullPath(
                Path.IsPathRooted(forbidden)
                    ? forbidden
                    : Path.Combine(contentRoot, forbidden));
            if (IsSameOrDescendant(_rootPath, resolved))
                throw new InvalidOperationException(
                    "AI order private storage resolves inside a forbidden static mapping.");
        }

        Directory.CreateDirectory(_rootPath);
        EnsurePathHasNoReparseComponents(_rootPath);
    }

    public async Task<string> SaveAsync(
        Stream content,
        PrivateObjectCategory category,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanRead)
            throw new ArgumentException("The content stream must be readable.", nameof(content));

        var categorySegment = CategorySegment(category);
        var categoryPath = ResolveCategoryPath(categorySegment);
        Directory.CreateDirectory(categoryPath);
        EnsurePathHasNoReparseComponents(categoryPath);
        var initialPosition = content.CanSeek ? content.Position : (long?)null;

        for (var collisionAttempt = 0; collisionAttempt < 5; collisionAttempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var opaqueName = Guid.NewGuid().ToString("N");
            var objectKey = $"{categorySegment}/{opaqueName}";
            var destinationPath = ResolveObjectPath(objectKey);
            var temporaryPath = Path.Combine(
                categoryPath,
                $".{opaqueName}.{Guid.NewGuid():N}.tmp");

            try
            {
                await using (var output = new FileStream(
                    temporaryPath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.None,
                    bufferSize: 81920,
                    useAsync: true))
                {
                    await content.CopyToAsync(output, cancellationToken);
                    await output.FlushAsync(cancellationToken);
                }

                File.Move(temporaryPath, destinationPath, overwrite: false);
                return objectKey;
            }
            catch (IOException) when (File.Exists(destinationPath))
            {
                TryDeleteTemporaryFile(temporaryPath);
                if (!initialPosition.HasValue)
                    throw new IOException(
                        "An opaque-key collision occurred for a non-seekable content stream.");
                content.Position = initialPosition.Value;
            }
            catch
            {
                TryDeleteTemporaryFile(temporaryPath);
                throw;
            }
        }

        throw new IOException("Could not allocate a unique private object key.");
    }

    public Task<Stream> OpenReadAsync(
        string objectKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Stream stream = new FileStream(
            ResolveObjectPath(objectKey),
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 81920,
            useAsync: true);
        return Task.FromResult(stream);
    }

    public Task<bool> ExistsAsync(
        string objectKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(File.Exists(ResolveObjectPath(objectKey)));
    }

    public Task DeleteAsync(
        string objectKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = ResolveObjectPath(objectKey);
        if (File.Exists(path))
            File.Delete(path);

        return Task.CompletedTask;
    }

    public async Task<PrivateStorageReadinessResult> CheckReadinessAsync(
        CancellationToken cancellationToken = default)
    {
        string? probeKey = null;
        try
        {
            if (!Directory.Exists(_rootPath))
                return new(PrivateStorageReadinessStatus.Missing);
            EnsurePathHasNoReparseComponents(_rootPath);

            var driveRoot = Path.GetPathRoot(_rootPath);
            var available = string.IsNullOrWhiteSpace(driveRoot)
                ? (long?)null
                : new DriveInfo(driveRoot).AvailableFreeSpace;
            if (available.HasValue && available.Value < _minimumFreeSpaceBytes)
                return new(PrivateStorageReadinessStatus.LowSpace, available);

            if (!OperatingSystem.IsWindows())
            {
                var mode = File.GetUnixFileMode(_rootPath);
                if ((mode & (UnixFileMode.OtherRead | UnixFileMode.OtherWrite |
                             UnixFileMode.GroupWrite)) != 0)
                    return new(PrivateStorageReadinessStatus.UnsafeLocation, available);
            }

            try
            {
                await using var probe = new MemoryStream(
                    System.Text.Encoding.ASCII.GetBytes("ai-order-storage-readiness-v1"));
                probeKey = await SaveAsync(
                    probe,
                    PrivateObjectCategory.RawProviderEvidence,
                    cancellationToken);
                await using var reopened = await OpenReadAsync(probeKey, cancellationToken);
                if (reopened.Length == 0)
                    return new(PrivateStorageReadinessStatus.WriteTestFailed, available);
            }
            catch (UnauthorizedAccessException)
            {
                return new(PrivateStorageReadinessStatus.PermissionDenied, available);
            }
            catch
            {
                return new(PrivateStorageReadinessStatus.WriteTestFailed, available);
            }

            try
            {
                await DeleteAsync(probeKey, cancellationToken);
                if (await ExistsAsync(probeKey, cancellationToken))
                    return new(PrivateStorageReadinessStatus.DeleteTestFailed, available);
                probeKey = null;
            }
            catch (UnauthorizedAccessException)
            {
                return new(PrivateStorageReadinessStatus.PermissionDenied, available);
            }
            catch
            {
                return new(PrivateStorageReadinessStatus.DeleteTestFailed, available);
            }

            return new(PrivateStorageReadinessStatus.Ready, available);
        }
        catch (UnauthorizedAccessException)
        {
            return new(PrivateStorageReadinessStatus.PermissionDenied);
        }
        catch (InvalidOperationException)
        {
            return new(PrivateStorageReadinessStatus.UnsafeLocation);
        }
        catch
        {
            return new(PrivateStorageReadinessStatus.WriteTestFailed);
        }
        finally
        {
            if (probeKey is not null)
            {
                try
                {
                    await DeleteAsync(probeKey, CancellationToken.None);
                }
                catch
                {
                    // The safe readiness status already reports the failed phase.
                }
            }
        }
    }

    private string ResolveCategoryPath(string categorySegment)
    {
        var path = Path.GetFullPath(Path.Combine(_rootPath, categorySegment));
        if (!IsSameOrDescendant(path, _rootPath))
            throw new InvalidOperationException("Private storage category escaped its configured root.");
        return path;
    }

    private string ResolveObjectPath(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey) || !ObjectKeyPattern().IsMatch(objectKey))
            throw new ArgumentException("Invalid private object key.", nameof(objectKey));

        var segments = objectKey.Split('/');
        var path = Path.GetFullPath(Path.Combine(_rootPath, segments[0], segments[1]));
        if (!IsSameOrDescendant(path, _rootPath))
            throw new ArgumentException("Invalid private object key.", nameof(objectKey));

        return path;
    }

    private static string CategorySegment(PrivateObjectCategory category) =>
        category switch
        {
            PrivateObjectCategory.SourceDocument => "source-documents",
            PrivateObjectCategory.RawProviderEvidence => "raw-provider-evidence",
            _ => throw new ArgumentOutOfRangeException(nameof(category)),
        };

    private static bool IsSameOrDescendant(string candidate, string parent)
    {
        var relative = Path.GetRelativePath(parent, candidate);
        return relative == "." ||
               (!relative.StartsWith("..", StringComparison.Ordinal) &&
                !Path.IsPathRooted(relative));
    }

    private static void TryDeleteTemporaryFile(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // The original write/move exception is the actionable failure.
        }
    }

    private static void EnsurePathHasNoReparseComponents(string path)
    {
        DirectoryInfo? current = new(path);
        while (current is not null)
        {
            if (current.Exists &&
                (current.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidOperationException(
                    "Private storage paths must not contain symbolic links or reparse points.");
            }

            current = current.Parent;
        }
    }

    [GeneratedRegex(
        "^(source-documents|raw-provider-evidence)/[0-9a-f]{32}$",
        RegexOptions.CultureInvariant)]
    private static partial Regex ObjectKeyPattern();
}
