using System.IO;
using System.Threading;
using System.Threading.Tasks;
using TeeNova.AiOrderImports.PrivateStorage;

namespace TeeNova.Enquiries.PrivateStorage;

public interface IQuotePrivateObjectStorage
{
    Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default);
    Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(string objectKey, CancellationToken cancellationToken = default);
    Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default);
    Task<PrivateStorageReadinessResult> CheckReadinessAsync(CancellationToken cancellationToken = default);
}
