using System;
using System.Collections.Generic;
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

    // ── Admin: Products ───────────────────────────────────────────────────────

    public async Task<ProductDto> CreateAsync(CreateProductDto input)
    {
        var product = new Product(GuidGenerator.Create(), input.Name, input.BasePrice, input.ProductType)
        {
            Description = input.Description,
            IsActive = input.IsActive,
        };

        await _productRepository.InsertAsync(product, autoSave: true);
        return await GetAsync(product.Id);
    }

    public async Task<ProductDto> UpdateAsync(Guid id, UpdateProductDto input)
    {
        var product = await _productRepository.GetAsync(id);
        product.Name = input.Name;
        product.Description = input.Description;
        product.BasePrice = input.BasePrice;
        product.ProductType = input.ProductType;
        product.IsActive = input.IsActive;
        await _productRepository.UpdateAsync(product, autoSave: true);
        return await GetAsync(id);
    }

    public async Task<ProductDto> UpdateStatusAsync(Guid id, UpdateProductStatusDto input)
    {
        var product = await _productRepository.GetAsync(id);
        product.IsActive = input.IsActive;
        await _productRepository.UpdateAsync(product, autoSave: true);
        return await GetAsync(id);
    }

    public Task DeleteAsync(Guid id)
        => throw new NotImplementedException("CatalogAppService.DeleteAsync is not yet implemented.");

    // ── Admin: Variants ───────────────────────────────────────────────────────

    public Task<ProductVariantDto> CreateVariantAsync(Guid productId, CreateProductVariantDto input)
        => throw new NotImplementedException("CatalogAppService.CreateVariantAsync is not yet implemented.");

    public Task<ProductVariantDto> UpdateVariantAsync(Guid productId, Guid variantId, UpdateProductVariantDto input)
        => throw new NotImplementedException("CatalogAppService.UpdateVariantAsync is not yet implemented.");

    public Task DeleteVariantAsync(Guid productId, Guid variantId)
        => throw new NotImplementedException("CatalogAppService.DeleteVariantAsync is not yet implemented.");

    public Task<ProductVariantDto> UpdateStockAsync(Guid productId, Guid variantId, UpdateStockDto input)
        => throw new NotImplementedException("CatalogAppService.UpdateStockAsync is not yet implemented.");
}
