using System;
using System.Threading.Tasks;
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
}
