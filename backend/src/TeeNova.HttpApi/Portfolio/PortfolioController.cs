using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Portfolio;

[ApiController]
[Route("api/portfolio")]
[Authorize(Roles = $"{TeeNovaRoles.Admin},{TeeNovaRoles.Viewer}")]
public sealed class PortfolioController : TeeNovaControllerBase
{
    private readonly IPortfolioAppService _service;
    public PortfolioController(IPortfolioAppService service) => _service = service;

    [AllowAnonymous, HttpGet("items")]
    public Task<PagedResultDto<PortfolioItemDto>> GetPublishedAsync([FromQuery] GetPortfolioItemsInput input) => _service.GetPublishedAsync(input);
    [AllowAnonymous, HttpGet("items/{slug}")]
    public Task<PortfolioItemDto> GetPublishedBySlugAsync(string slug) => _service.GetPublishedBySlugAsync(slug);
    [AllowAnonymous, HttpGet("items/{slug}/images/{imageId:guid}")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> GetPublishedImageAsync(string slug, Guid imageId)
    { var result = await _service.OpenPublishedImageAsync(slug, imageId); Response.Headers.ETag = $"\"{result.Sha256}\""; return File(result.Stream, result.ContentType, enableRangeProcessing: true); }

    [HttpGet("admin/items")]
    public Task<PagedResultDto<PortfolioItemDto>> GetAdminListAsync([FromQuery] GetPortfolioItemsInput input) => _service.GetAdminListAsync(input);
    [HttpGet("admin/items/{id:guid}")]
    public Task<PortfolioItemDto> GetAdminAsync(Guid id) => _service.GetAdminAsync(id);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPost("admin/items")]
    public Task<PortfolioItemDto> CreateAsync([FromBody] CreatePortfolioItemDto input) => _service.CreateAsync(input);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPut("admin/items/{id:guid}")]
    public Task<PortfolioItemDto> UpdateAsync(Guid id, [FromBody] UpdatePortfolioItemDto input) => _service.UpdateAsync(id, input);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPost("admin/items/{id:guid}/images"), RequestSizeLimit(10*1024*1024), Consumes("multipart/form-data")]
    public Task<PortfolioImageDto> UploadImageAsync(Guid id, [FromForm] PortfolioImageUploadDto input, CancellationToken token) => _service.UploadImageAsync(id, input, token);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPut("admin/items/{id:guid}/images/{imageId:guid}")]
    public Task<PortfolioImageDto> UpdateImageAsync(Guid id, Guid imageId, [FromBody] UpdatePortfolioImageDto input) => _service.UpdateImageAsync(id,imageId,input);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpDelete("admin/items/{id:guid}/images/{imageId:guid}")]
    public Task DeleteImageAsync(Guid id, Guid imageId) => _service.DeleteImageAsync(id,imageId);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPost("admin/items/{id:guid}/publish")]
    public Task<PortfolioItemDto> PublishAsync(Guid id) => _service.PublishAsync(id);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPost("admin/items/{id:guid}/archive")]
    public Task<PortfolioItemDto> ArchiveAsync(Guid id) => _service.ArchiveAsync(id);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpPost("admin/items/{id:guid}/unpublish")]
    public Task<PortfolioItemDto> UnpublishAsync(Guid id) => _service.UnpublishAsync(id);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpDelete("admin/items/{id:guid}")]
    public Task DeleteAsync(Guid id) => _service.DeleteAsync(id);
    [Authorize(Roles=TeeNovaRoles.Admin), HttpGet("admin/items/{id:guid}/images/{imageId:guid}/content")]
    [ResponseCache(NoStore=true, Location=ResponseCacheLocation.None)]
    public async Task<IActionResult> GetAdminImageAsync(Guid id, Guid imageId)
    { var result=await _service.OpenAdminImageAsync(id,imageId); return File(result.Stream,result.ContentType,enableRangeProcessing:true); }
}
