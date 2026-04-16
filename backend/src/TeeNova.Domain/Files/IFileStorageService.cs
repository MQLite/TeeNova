using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.Files;

/// <summary>
/// Abstraction for file storage. Swap implementations to move from
/// local disk to Azure Blob Storage, AWS S3, or Cloudflare R2.
///
/// Storage folders:
///   "designs"  — customer-uploaded print design files (orphan-cleanup eligible)
///   "products" — admin-uploaded product catalog images (permanent)
/// </summary>
public interface IFileStorageService
{
    /// <summary>
    /// Saves a file stream under the given <paramref name="folder"/> and
    /// returns a publicly accessible URL.
    /// </summary>
    Task<string> SaveAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        string folder,
        string? fileNamePrefix = null,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(string fileUrl, CancellationToken cancellationToken = default);

    Task<Stream> GetAsync(string fileUrl, CancellationToken cancellationToken = default);
}
