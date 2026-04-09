using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace TeeNova.Files;

/// <summary>
/// Development-only local disk implementation.
/// Replace with AzureBlobStorageService or S3FileStorageService before production.
/// Files are saved under {ContentRoot}/wwwroot/uploads so UseStaticFiles() can serve them.
/// </summary>
public class LocalFileStorageService : IFileStorageService
{
    private readonly string _uploadDirectory;
    private readonly string _baseUrl;

    public LocalFileStorageService(IConfiguration configuration, IHostEnvironment env)
    {
        // ContentRootPath is the project root; wwwroot is served by UseStaticFiles()
        _uploadDirectory = Path.Combine(env.ContentRootPath, "wwwroot", "uploads");
        _baseUrl = configuration["App:SelfUrl"] ?? "https://localhost:44300";

        if (!Directory.Exists(_uploadDirectory))
            Directory.CreateDirectory(_uploadDirectory);
    }

    public async Task<string> SaveAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var uniqueFileName = $"{Guid.NewGuid():N}_{Path.GetFileName(fileName)}";
        var filePath = Path.Combine(_uploadDirectory, uniqueFileName);

        await using var fileStreamOut = new FileStream(filePath, FileMode.Create);
        await fileStream.CopyToAsync(fileStreamOut, cancellationToken);

        return $"{_baseUrl}/uploads/{uniqueFileName}";
    }

    public Task DeleteAsync(string fileUrl, CancellationToken cancellationToken = default)
    {
        var fileName = Path.GetFileName(new Uri(fileUrl).LocalPath);
        var filePath = Path.Combine(_uploadDirectory, fileName);

        if (File.Exists(filePath))
            File.Delete(filePath);

        return Task.CompletedTask;
    }

    public Task<Stream> GetAsync(string fileUrl, CancellationToken cancellationToken = default)
    {
        var fileName = Path.GetFileName(new Uri(fileUrl).LocalPath);
        var filePath = Path.Combine(_uploadDirectory, fileName);

        Stream stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        return Task.FromResult(stream);
    }
}
