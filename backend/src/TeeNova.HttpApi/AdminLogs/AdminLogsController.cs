using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.AdminLogs.Dtos;
using TeeNova.Auth;

namespace TeeNova.AdminLogs;

[ApiController]
[Route("api/admin/logs")]
[Authorize(Roles = TeeNovaRoles.Admin)]
public sealed class AdminLogsController : TeeNovaControllerBase
{
    private readonly IAdminLogAppService _appService;
    private readonly IAdminLogDownloadService _downloadService;
    private readonly IAdminLogDownloadAudit _downloadAudit;
    private readonly TimeProvider _timeProvider;

    public AdminLogsController(
        IAdminLogAppService appService,
        IAdminLogDownloadService downloadService,
        IAdminLogDownloadAudit downloadAudit,
        TimeProvider timeProvider)
    {
        _appService = appService;
        _downloadService = downloadService;
        _downloadAudit = downloadAudit;
        _timeProvider = timeProvider;
    }

    [HttpGet]
    public Task<AdminLogListResultDto> GetListAsync([FromQuery] GetAdminLogsInput input)
        => _appService.GetListAsync(input);

    [HttpGet("{fileId}/download")]
    public async Task<IActionResult> DownloadAsync(
        [FromRoute] string fileId,
        CancellationToken cancellationToken)
    {
        var openedFile = await _downloadService.PrepareAsync(fileId);
        return new AdminLogDownloadResult(openedFile, _downloadAudit, _timeProvider);
    }
}
