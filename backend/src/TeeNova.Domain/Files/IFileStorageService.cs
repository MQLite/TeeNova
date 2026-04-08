using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.Files;

/// <summary>
/// Abstraction for file storage. Swap implementations to move from
/// local disk to Azure Blob Storage, AWS S3, or Cloudflare R2.
/// </summary>
public interface IFileStorageService
{
    /// <summary>Saves a file stream and returns a publicly accessible URL.</summary>
    Task<string> SaveAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(string fileUrl, CancellationToken cancellationToken = default);

    Task<Stream> GetAsync(string fileUrl, CancellationToken cancellationToken = default);
}
