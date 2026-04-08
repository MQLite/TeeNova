using System;
using System.Threading.Tasks;
using TeeNova.Catalog.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Catalog;

public interface ICatalogAppService : IApplicationService
{
    Task<PagedResultDto<ProductListItemDto>> GetListAsync(GetProductsInput input);
    Task<ProductDto> GetAsync(Guid id);
}
