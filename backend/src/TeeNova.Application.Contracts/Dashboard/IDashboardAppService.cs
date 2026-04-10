using System.Threading.Tasks;
using TeeNova.Dashboard.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Dashboard;

public interface IDashboardAppService : IApplicationService
{
    Task<DashboardStatsDto> GetStatsAsync();
}
