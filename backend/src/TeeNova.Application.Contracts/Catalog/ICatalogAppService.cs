using System;
using System.Collections.Generic;
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
    Task<ProductVariantDto> UpdateVariantInventoryAsync(Guid productId, Guid variantId, UpdateVariantInventoryDto input);
    Task<List<ProductVariantDto>> BulkSaveVariantsAsync(Guid productId, BulkSaveProductVariantsDto input);

    // ── Admin: Price Tiers (Jira 9102, DEPRECATED — inert in pricing) ────────────
    Task<ProductDto> SetPriceTiersAsync(Guid productId, SetProductPriceTiersDto input);

    // ── Print Pricing Groups (Jira 9203) ─────────────────────────────────────────
    Task<List<PrintPricingGroupDto>> GetPrintPricingGroupsAsync(bool? isActive = null);
    Task<PrintPricingGroupDto> CreatePrintPricingGroupAsync(CreateUpdatePrintPricingGroupDto input);
    Task<PrintPricingGroupDto> UpdatePrintPricingGroupAsync(Guid groupId, CreateUpdatePrintPricingGroupDto input);

    // ── Print Price Tiers (Jira 9203, group-scoped single-writer) ─────────────────
    Task<List<ProductPrintPriceTierDto>> GetPrintPriceTiersAsync(Guid groupId);
    Task<List<ProductPrintPriceTierDto>> SetPrintPriceTiersAsync(Guid groupId, SetProductPrintPriceTiersDto input);

    // ── Print Config Options (Jira 9204, product-scoped single-writer) ────────────
    Task<List<ProductPrintConfigOptionDto>> GetPrintConfigOptionsAsync(Guid productId);
    Task<List<ProductPrintConfigOptionDto>> SetPrintConfigOptionsAsync(Guid productId, SetProductPrintConfigOptionsDto input);

    // ── Badge Quantity Price Tiers (Jira 9503, product-scoped single-writer) ──────
    Task<List<ProductQuantityPriceTierDto>> GetQuantityPriceTiersAsync(Guid productId);
    Task<List<ProductQuantityPriceTierDto>> SetQuantityPriceTiersAsync(Guid productId, SetProductQuantityPriceTiersDto input);
}
