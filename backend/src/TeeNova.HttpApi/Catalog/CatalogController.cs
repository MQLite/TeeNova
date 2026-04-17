using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Catalog.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Catalog;

[ApiController]
[Route("api/catalog")]
public class CatalogController : TeeNovaControllerBase
{
    private readonly ICatalogAppService _catalogAppService;

    public CatalogController(ICatalogAppService catalogAppService)
    {
        _catalogAppService = catalogAppService;
    }

    /// <summary>Returns paginated product list. Supports filtering by type and search term.</summary>
    [HttpGet("products")]
    public async Task<PagedResultDto<ProductListItemDto>> GetListAsync([FromQuery] GetProductsInput input)
        => await _catalogAppService.GetListAsync(input);

    /// <summary>Returns full product detail including all variants and images.</summary>
    [HttpGet("products/{id:guid}")]
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
}
