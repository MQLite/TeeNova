using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Dashboard.Dtos;

namespace TeeNova.Dashboard;

[ApiController]
[Route("api/admin/dashboard")]
public class DashboardController : TeeNovaControllerBase
{
    private readonly IDashboardAppService _dashboardAppService;

    public DashboardController(IDashboardAppService dashboardAppService)
    {
        _dashboardAppService = dashboardAppService;
    }

    [HttpGet("summary")]
    public async Task<DashboardStatsDto> GetSummaryAsync()
        => await _dashboardAppService.GetStatsAsync();
}
