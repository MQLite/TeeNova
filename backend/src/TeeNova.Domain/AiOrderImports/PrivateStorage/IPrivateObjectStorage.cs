using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.AiOrderImports.PrivateStorage;

public interface IPrivateObjectStorage
{
    Task<string> SaveAsync(
        Stream content,
        PrivateObjectCategory category,
        CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(
        string objectKey,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(
        string objectKey,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        string objectKey,
        CancellationToken cancellationToken = default);
}
