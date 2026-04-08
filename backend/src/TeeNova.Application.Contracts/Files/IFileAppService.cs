using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using TeeNova.Files.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Files;

public interface IFileAppService : IApplicationService
{
    Task<UploadFileOutput> UploadAsync(IFormFile file, CancellationToken cancellationToken = default);
}
