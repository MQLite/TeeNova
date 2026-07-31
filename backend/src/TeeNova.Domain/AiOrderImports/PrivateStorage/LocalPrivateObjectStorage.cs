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

        var publicRoot = Path.GetFullPath(Path.Combine(contentRoot, "wwwroot"));
        if (IsSameOrDescendant(_rootPath, publicRoot))
        {
            throw new InvalidOperationException(
                "AI order private storage must resolve outside wwwroot.");
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
