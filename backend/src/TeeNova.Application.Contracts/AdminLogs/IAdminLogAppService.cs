using System.Threading.Tasks;
using TeeNova.AdminLogs.Dtos;

namespace TeeNova.AdminLogs;

public interface IAdminLogAppService
{
    Task<AdminLogListResultDto> GetListAsync(GetAdminLogsInput input);
}
