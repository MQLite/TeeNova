using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using TeeNova.Catalog.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Catalog;

public interface ICatalogAppService : IApplicationService
{
    // ── Storefront ────────────────────────────────────────────────────────────
    Task<PagedResultDto<ProductListItemDto>> GetListAsync(GetProductsInput input);
    Task<ProductDto> GetAsync(Guid id);

    // ── Admin: Products ───────────────────────────────────────────────────────
    Task<ProductDto> CreateAsync(CreateProductDto input);
    Task<ProductDto> UpdateAsync(Guid id, UpdateProductDto input);
    Task<ProductDto> UpdateStatusAsync(Guid id, UpdateProductStatusDto input);
    Task DeleteAsync(Guid id);

    // ── Admin: Images ─────────────────────────────────────────────────────────
    Task<ProductImageDto> UploadProductImageAsync(Guid productId, IFormFile file, CancellationToken cancellationToken = default);
    Task<ProductImageDto> UpdateProductImageAsync(Guid productId, Guid imageId, UpdateProductImageDto input);
    Task SetPrimaryProductImageAsync(Guid productId, Guid imageId);
    Task DeleteProductImageAsync(Guid productId, Guid imageId);

    // ── Admin: Variants ───────────────────────────────────────────────────────
    Task<ProductVariantDto> CreateVariantAsync(Guid productId, CreateProductVariantDto input);
    Task<ProductVariantDto> UpdateVariantAsync(Guid productId, Guid variantId, UpdateProductVariantDto input);
    Task DeleteVariantAsync(Guid productId, Guid variantId);
    Task<ProductVariantDto> UpdateStockAsync(Guid productId, Guid variantId, UpdateStockDto input);
}
