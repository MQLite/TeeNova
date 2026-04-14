using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Files.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Files;

[ApiController]
[Route("api/files")]
public class FileController : TeeNovaControllerBase
{
    private readonly IFileAppService _fileAppService;

    public FileController(IFileAppService fileAppService)
    {
        _fileAppService = fileAppService;
    }

    /// <summary>
    /// Uploads a design image. Returns an asset ID and public URL.
    /// Max 10 MB. Accepted: PNG, JPEG, SVG, WebP.
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<UploadFileOutput> UploadAsync(
        IFormFile file,
        CancellationToken cancellationToken)
        => await _fileAppService.UploadAsync(file, cancellationToken);

    /// <summary>Returns a paged list of all uploaded assets with linked order metadata.</summary>
    [HttpGet("assets")]
    public async Task<PagedResultDto<AdminAssetDto>> GetAssetListAsync(
        [FromQuery] int skipCount = 0,
        [FromQuery] int maxResultCount = 50)
        => await _fileAppService.GetAdminAssetListAsync(new PagedResultRequestDto
        {
            SkipCount = skipCount,
            MaxResultCount = maxResultCount,
        });

    /// <summary>Returns a single asset with linked order metadata.</summary>
    [HttpGet("assets/{id:guid}")]
    public async Task<AdminAssetDto> GetAssetAsync(Guid id)
        => await _fileAppService.GetAdminAssetAsync(id);
}
