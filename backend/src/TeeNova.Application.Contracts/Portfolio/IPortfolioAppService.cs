using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Portfolio;

public interface IPortfolioAppService : IApplicationService
{
    Task<PagedResultDto<PortfolioItemDto>> GetPublishedAsync(GetPortfolioItemsInput input);
    Task<PortfolioItemDto> GetPublishedBySlugAsync(string slug);
    Task<PagedResultDto<PortfolioItemDto>> GetAdminListAsync(GetPortfolioItemsInput input);
    Task<PortfolioItemDto> GetAdminAsync(Guid id);
    Task<PortfolioItemDto> CreateAsync(CreatePortfolioItemDto input);
    Task<PortfolioItemDto> UpdateAsync(Guid id, UpdatePortfolioItemDto input);
    Task<PortfolioImageDto> UploadImageAsync(Guid id, PortfolioImageUploadDto input, CancellationToken cancellationToken = default);
    Task<PortfolioImageDto> UpdateImageAsync(Guid id, Guid imageId, UpdatePortfolioImageDto input);
    Task DeleteImageAsync(Guid id, Guid imageId);
    Task<PortfolioItemDto> PublishAsync(Guid id);
    Task<PortfolioItemDto> ArchiveAsync(Guid id);
    Task<PortfolioItemDto> UnpublishAsync(Guid id);
    Task DeleteAsync(Guid id);
    Task<PortfolioImageContent> OpenAdminImageAsync(Guid id, Guid imageId);
    Task<PortfolioImageContent> OpenPublishedImageAsync(string slug, Guid imageId);
}

