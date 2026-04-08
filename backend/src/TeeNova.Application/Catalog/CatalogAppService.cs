using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TeeNova.Catalog.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Catalog;

public class CatalogAppService : ApplicationService, ICatalogAppService
{
    private readonly IRepository<Product, Guid> _productRepository;

    public CatalogAppService(IRepository<Product, Guid> productRepository)
    {
        _productRepository = productRepository;
    }

    public async Task<PagedResultDto<ProductListItemDto>> GetListAsync(GetProductsInput input)
    {
        var query = await _productRepository.GetQueryableAsync();

        query = query
            .Include(p => p.Images)
            .Include(p => p.Variants);

        if (input.IsActive.HasValue)
            query = query.Where(p => p.IsActive == input.IsActive.Value);

        if (!string.IsNullOrWhiteSpace(input.ProductType))
            query = query.Where(p => p.ProductType == input.ProductType);

        if (!string.IsNullOrWhiteSpace(input.Search))
            query = query.Where(p => p.Name.Contains(input.Search));

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(p => p.Name)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        return new PagedResultDto<ProductListItemDto>(
            totalCount,
            ObjectMapper.Map<List<Product>, List<ProductListItemDto>>(items)
        );
    }

    public async Task<ProductDto> GetAsync(Guid id)
    {
        var query = await _productRepository.GetQueryableAsync();

        var product = await query
            .Include(p => p.Variants)
            .Include(p => p.Images)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Product), id);

        return ObjectMapper.Map<Product, ProductDto>(product);
    }
}
