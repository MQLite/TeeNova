using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Catalog.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Catalog;

[ApiController]
[Route("api/catalog")]
[Authorize]
public class CatalogController : TeeNovaControllerBase
{
    private readonly ICatalogAppService _catalogAppService;

    public CatalogController(ICatalogAppService catalogAppService)
    {
        _catalogAppService = catalogAppService;
    }

    /// <summary>Returns paginated product list. Supports filtering by type and search term.</summary>
    [HttpGet("products")]
    [AllowAnonymous]
    public async Task<PagedResultDto<ProductListItemDto>> GetListAsync([FromQuery] GetProductsInput input)
        => await _catalogAppService.GetListAsync(input);

    /// <summary>Returns full product detail including all variants and images.</summary>
    [HttpGet("products/{id:guid}")]
    [AllowAnonymous]
    public async Task<ProductDto> GetAsync(Guid id)
        => await _catalogAppService.GetAsync(id);

    /// <summary>Creates a new product.</summary>
    [HttpPost("products")]
    public async Task<ProductDto> CreateAsync([FromBody] CreateProductDto input)
        => await _catalogAppService.CreateAsync(input);

    /// <summary>Updates name, description, base price, product type, and active status.</summary>
    [HttpPut("products/{id:guid}")]
    public async Task<ProductDto> UpdateAsync(Guid id, [FromBody] UpdateProductDto input)
        => await _catalogAppService.UpdateAsync(id, input);

    /// <summary>Toggles the active/inactive status of a product.</summary>
    [HttpPut("products/{id:guid}/status")]
    public async Task<ProductDto> UpdateStatusAsync(Guid id, [FromBody] UpdateProductStatusDto input)
        => await _catalogAppService.UpdateStatusAsync(id, input);

    // ── Images ────────────────────────────────────────────────────────────────

    /// <summary>Uploads a product catalog image (JPEG, PNG, or WebP) and links it to the product.</summary>
    [HttpPost("products/{id:guid}/images/upload")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<ProductImageDto> UploadProductImageAsync(
        Guid id,
        [FromForm] IFormFile file,
        CancellationToken cancellationToken)
        => await _catalogAppService.UploadProductImageAsync(id, file, cancellationToken);

    /// <summary>Updates metadata (e.g. color tag) of an existing product image.</summary>
    [HttpPut("products/{id:guid}/images/{imageId:guid}")]
    public async Task<ProductImageDto> UpdateProductImageAsync(Guid id, Guid imageId, [FromBody] UpdateProductImageDto input)
        => await _catalogAppService.UpdateProductImageAsync(id, imageId, input);

    /// <summary>Marks the specified image as the primary image for this product.</summary>
    [HttpPut("products/{id:guid}/images/{imageId:guid}/primary")]
    public async Task SetPrimaryProductImageAsync(Guid id, Guid imageId)
        => await _catalogAppService.SetPrimaryProductImageAsync(id, imageId);

    /// <summary>Deletes a product image. Auto-promotes the next image to primary if needed.</summary>
    [HttpDelete("products/{id:guid}/images/{imageId:guid}")]
    public async Task DeleteProductImageAsync(Guid id, Guid imageId)
        => await _catalogAppService.DeleteProductImageAsync(id, imageId);

    // ── Variants ──────────────────────────────────────────────────────────────

    /// <summary>Creates a new variant (size/color combination) under a product.</summary>
    [HttpPost("products/{productId:guid}/variants")]
    public async Task<ProductVariantDto> CreateVariantAsync(Guid productId, [FromBody] CreateProductVariantDto input)
        => await _catalogAppService.CreateVariantAsync(productId, input);

    /// <summary>Updates an existing variant's fields.</summary>
    [HttpPut("products/{productId:guid}/variants/{variantId:guid}")]
    public async Task<ProductVariantDto> UpdateVariantAsync(Guid productId, Guid variantId, [FromBody] UpdateProductVariantDto input)
        => await _catalogAppService.UpdateVariantAsync(productId, variantId, input);

    /// <summary>Deletes a variant from a product.</summary>
    [HttpDelete("products/{productId:guid}/variants/{variantId:guid}")]
    public async Task DeleteVariantAsync(Guid productId, Guid variantId)
        => await _catalogAppService.DeleteVariantAsync(productId, variantId);

    /// <summary>
    /// Records informational inventory for a variant (admin only). Does not affect checkout,
    /// customer availability, or stock deduction.
    /// </summary>
    [HttpPut("products/{productId:guid}/variants/{variantId:guid}/inventory")]
    public async Task<ProductVariantDto> UpdateVariantInventoryAsync(
        Guid productId, Guid variantId, [FromBody] UpdateVariantInventoryDto input)
        => await _catalogAppService.UpdateVariantInventoryAsync(productId, variantId, input);

    /// <summary>Bulk creates or updates variants for a product from a Size × Color matrix save.</summary>
    [HttpPut("products/{productId:guid}/variants/bulk")]
    public async Task<List<ProductVariantDto>> BulkSaveVariantsAsync(
        Guid productId, [FromBody] BulkSaveProductVariantsDto input)
        => await _catalogAppService.BulkSaveVariantsAsync(productId, input);

    // ── Price Tiers ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Replaces the full set of quantity-break price tiers for a product (admin only, dedicated
    /// single-writer endpoint). Normal product/variant edits never touch tiers. Sending an empty
    /// list clears all tiers and reverts the product to additive pricing.
    /// </summary>
    [HttpPut("products/{productId:guid}/price-tiers")]
    public async Task<ProductDto> SetPriceTiersAsync(Guid productId, [FromBody] SetProductPriceTiersDto input)
        => await _catalogAppService.SetPriceTiersAsync(productId, input);

    // ── Print Pricing Groups (Jira 9203) ─────────────────────────────────────────

    /// <summary>Lists print pricing groups. Pass isActive to filter; omit for all.</summary>
    [HttpGet("print-pricing-groups")]
    [AllowAnonymous]
    public async Task<List<PrintPricingGroupDto>> GetPrintPricingGroupsAsync([FromQuery] bool? isActive = null)
        => await _catalogAppService.GetPrintPricingGroupsAsync(isActive);

    /// <summary>Creates a print pricing group (admin).</summary>
    [HttpPost("print-pricing-groups")]
    public async Task<PrintPricingGroupDto> CreatePrintPricingGroupAsync([FromBody] CreateUpdatePrintPricingGroupDto input)
        => await _catalogAppService.CreatePrintPricingGroupAsync(input);

    /// <summary>Updates a print pricing group (admin).</summary>
    [HttpPut("print-pricing-groups/{groupId:guid}")]
    public async Task<PrintPricingGroupDto> UpdatePrintPricingGroupAsync(Guid groupId, [FromBody] CreateUpdatePrintPricingGroupDto input)
        => await _catalogAppService.UpdatePrintPricingGroupAsync(groupId, input);

    // ── Print Price Tiers (Jira 9203, group-scoped single-writer) ─────────────────

    /// <summary>Returns the print price tiers for a group.</summary>
    [HttpGet("print-pricing-groups/{groupId:guid}/print-price-tiers")]
    [AllowAnonymous]
    public async Task<List<ProductPrintPriceTierDto>> GetPrintPriceTiersAsync(Guid groupId)
        => await _catalogAppService.GetPrintPriceTiersAsync(groupId);

    /// <summary>
    /// Replaces the full set of print price tiers for a group (admin, single-writer). Sending an
    /// empty list clears the group's print tiers (printing falls back to PrintSize.BasePrice).
    /// </summary>
    [HttpPut("print-pricing-groups/{groupId:guid}/print-price-tiers")]
    public async Task<List<ProductPrintPriceTierDto>> SetPrintPriceTiersAsync(Guid groupId, [FromBody] SetProductPrintPriceTiersDto input)
        => await _catalogAppService.SetPrintPriceTiersAsync(groupId, input);

    // ── Print Config Options (Jira 9204, product-scoped single-writer) ────────────

    /// <summary>Returns a product's scoped allowed print options (admin, incl. inactive rows).</summary>
    [HttpGet("products/{productId:guid}/print-config-options")]
    public async Task<List<ProductPrintConfigOptionDto>> GetPrintConfigOptionsAsync(Guid productId)
        => await _catalogAppService.GetPrintConfigOptionsAsync(productId);

    /// <summary>
    /// Replaces the full set of product/size scoped allowed print options (admin, single-writer).
    /// Sending an empty list clears scoped options (the product reverts to the global matrix).
    /// </summary>
    [HttpPut("products/{productId:guid}/print-config-options")]
    public async Task<List<ProductPrintConfigOptionDto>> SetPrintConfigOptionsAsync(Guid productId, [FromBody] SetProductPrintConfigOptionsDto input)
        => await _catalogAppService.SetPrintConfigOptionsAsync(productId, input);
}
