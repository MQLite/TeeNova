namespace TeeNova.Portfolio.PrivateStorage;

public interface IPortfolioObjectStorage
{
    Task SaveAsync(string objectKey, Stream content, CancellationToken cancellationToken = default);
    Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default);
    Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default);
}

