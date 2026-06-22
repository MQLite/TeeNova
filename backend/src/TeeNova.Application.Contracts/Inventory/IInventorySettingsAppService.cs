using System.Threading.Tasks;
using TeeNova.Inventory.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Inventory;

public interface IInventorySettingsAppService : IApplicationService
{
    Task<InventorySettingsDto> GetAsync();
    Task<InventorySettingsDto> UpdateAsync(InventorySettingsDto input);
}
