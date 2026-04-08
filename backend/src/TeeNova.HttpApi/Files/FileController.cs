using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Files.Dtos;

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
}
