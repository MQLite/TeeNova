using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace TeeNova.Portfolio.PrivateStorage;

public sealed class LocalPortfolioObjectStorage : IPortfolioObjectStorage
{
    private readonly string _root;

    public LocalPortfolioObjectStorage(IHostEnvironment environment, IOptions<PortfolioOptions> options)
    {
        var configured = options.Value.StorageRoot;
        _root = Path.GetFullPath(Path.IsPathRooted(configured)
            ? configured
            : Path.Combine(environment.ContentRootPath, configured));
    }

    public async Task SaveAsync(string objectKey, Stream content, CancellationToken cancellationToken = default)
    {
        var path = Resolve(objectKey);
        Directory.CreateDirectory(_root);
        await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await content.CopyToAsync(output, cancellationToken);
    }

    public Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
        => Task.FromResult<Stream>(new FileStream(Resolve(objectKey), FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true));

    public Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        var path = Resolve(objectKey);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    private string Resolve(string objectKey)
    {
        if (objectKey.Length != 32 || objectKey.Any(c => !char.IsAsciiHexDigit(c)))
            throw new InvalidOperationException("Invalid portfolio object key.");
        var path = Path.GetFullPath(Path.Combine(_root, objectKey.ToLowerInvariant()));
        if (!path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Portfolio object path escaped the configured root.");
        return path;
    }
}
