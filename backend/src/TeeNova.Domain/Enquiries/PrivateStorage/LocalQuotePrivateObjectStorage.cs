using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;

namespace TeeNova.Enquiries.PrivateStorage;

/// <summary>Dedicated non-web-rooted storage for customer quote artwork.</summary>
public sealed partial class LocalQuotePrivateObjectStorage : IQuotePrivateObjectStorage
{
    private const UnixFileMode PrivateDirectoryMode =
        UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
    private readonly string _rootPath;
    private readonly long _minimumFreeSpaceBytes;

    public LocalQuotePrivateObjectStorage(
        IHostEnvironment environment,
        IOptions<QuotePrivateStorageOptions> options)
    {
        var contentRoot = Path.GetFullPath(environment.ContentRootPath);
        var configured = options.Value.RootPath;
        if (string.IsNullOrWhiteSpace(configured))
            throw new InvalidOperationException("QuotePrivateStorage:RootPath is required.");

        _rootPath = Path.GetFullPath(Path.IsPathRooted(configured)
            ? configured
            : Path.Combine(contentRoot, configured));
        _minimumFreeSpaceBytes = Math.Max(0, options.Value.MinimumFreeSpaceBytes);
        RejectUnsafeRoot(_rootPath, Path.Combine(contentRoot, "wwwroot"));
        foreach (var forbidden in options.Value.ForbiddenPathPrefixes ?? [])
        {
            if (!string.IsNullOrWhiteSpace(forbidden))
                RejectUnsafeRoot(_rootPath, Path.IsPathRooted(forbidden)
                    ? forbidden
                    : Path.Combine(contentRoot, forbidden));
        }
        CreatePrivateDirectory(_rootPath);
        EnsureNoReparsePoints(_rootPath);
    }

    public async Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanRead) throw new ArgumentException("The stream must be readable.", nameof(content));
        EnsureNoReparsePoints(_rootPath);
        var initialPosition = content.CanSeek ? content.Position : (long?)null;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var key = Guid.NewGuid().ToString("N");
            var destination = Resolve(key);
            var temporary = Path.Combine(_rootPath, $".{key}.{Guid.NewGuid():N}.tmp");
            try
            {
                await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write,
                    FileShare.None, 81920, true))
                {
                    await content.CopyToAsync(output, cancellationToken);
                    await output.FlushAsync(cancellationToken);
                }
                File.Move(temporary, destination, false);
                return key;
            }
            catch (IOException) when (File.Exists(destination) && initialPosition.HasValue)
            {
                TryDelete(temporary);
                content.Position = initialPosition.Value;
            }
            catch
            {
                TryDelete(temporary);
                throw;
            }
        }
        throw new IOException("Could not allocate a private object key.");
    }

    public Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Stream stream = new FileStream(Resolve(objectKey), FileMode.Open, FileAccess.Read,
            FileShare.Read, 81920, true);
        return Task.FromResult(stream);
    }

    public Task<bool> ExistsAsync(string objectKey, CancellationToken cancellationToken = default)
        => Task.FromResult(File.Exists(Resolve(objectKey)));

    public Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = Resolve(objectKey);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public async Task<PrivateStorageReadinessResult> CheckReadinessAsync(CancellationToken cancellationToken = default)
    {
        string? probeKey = null;
        try
        {
            if (!Directory.Exists(_rootPath)) return new(PrivateStorageReadinessStatus.Missing);
            EnsureNoReparsePoints(_rootPath);
            var driveRoot = Path.GetPathRoot(_rootPath);
            var available = string.IsNullOrWhiteSpace(driveRoot) ? (long?)null : new DriveInfo(driveRoot).AvailableFreeSpace;
            if (available.HasValue && available < _minimumFreeSpaceBytes)
                return new(PrivateStorageReadinessStatus.LowSpace, available);
            if (!OperatingSystem.IsWindows())
            {
                var mode = File.GetUnixFileMode(_rootPath);
                var publicBits = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute |
                                 UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute;
                if ((mode & publicBits) != 0) return new(PrivateStorageReadinessStatus.UnsafeLocation, available);
            }
            await using var probe = new MemoryStream(System.Text.Encoding.ASCII.GetBytes("quote-storage-readiness-v1"));
            probeKey = await SaveAsync(probe, cancellationToken);
            await using (var reopened = await OpenReadAsync(probeKey, cancellationToken))
            {
                if (reopened.Length == 0) return new(PrivateStorageReadinessStatus.WriteTestFailed, available);
            }
            await DeleteAsync(probeKey, cancellationToken);
            if (await ExistsAsync(probeKey, cancellationToken))
                return new(PrivateStorageReadinessStatus.DeleteTestFailed, available);
            probeKey = null;
            return new(PrivateStorageReadinessStatus.Ready, available);
        }
        catch (UnauthorizedAccessException) { return new(PrivateStorageReadinessStatus.PermissionDenied); }
        catch (InvalidOperationException) { return new(PrivateStorageReadinessStatus.UnsafeLocation); }
        catch { return new(PrivateStorageReadinessStatus.WriteTestFailed); }
        finally
        {
            if (probeKey is not null) try { await DeleteAsync(probeKey, CancellationToken.None); } catch { }
        }
    }

    private string Resolve(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || !ObjectKeyPattern().IsMatch(key))
            throw new ArgumentException("Invalid private object key.", nameof(key));
        var path = Path.GetFullPath(Path.Combine(_rootPath, key));
        if (!IsSameOrDescendant(path, _rootPath)) throw new ArgumentException("Invalid private object key.", nameof(key));
        return path;
    }

    private static void RejectUnsafeRoot(string root, string forbidden)
    {
        if (IsSameOrDescendant(root, Path.GetFullPath(forbidden)))
            throw new InvalidOperationException("Quote private storage must resolve outside static mappings.");
    }

    private static bool IsSameOrDescendant(string candidate, string parent)
    {
        var relative = Path.GetRelativePath(parent, candidate);
        return relative == "." || (!relative.StartsWith("..", StringComparison.Ordinal) && !Path.IsPathRooted(relative));
    }

    private static void CreatePrivateDirectory(string path)
    {
        if (OperatingSystem.IsWindows() || Directory.Exists(path)) Directory.CreateDirectory(path);
        else Directory.CreateDirectory(path, PrivateDirectoryMode);
    }

    private static void EnsureNoReparsePoints(string path)
    {
        DirectoryInfo? current = new(path);
        while (current is not null)
        {
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Private storage paths must not contain links or reparse points.");
            current = current.Parent;
        }
    }

    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }

    [GeneratedRegex("^[0-9a-f]{32}$", RegexOptions.CultureInvariant)]
    private static partial Regex ObjectKeyPattern();
}
