using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using TeeNova.Inventory.Dtos;

namespace TeeNova.Inventory;

[ApiController]
[Route("api/admin/inventory-settings")]
[Authorize]
public class InventorySettingsController : TeeNovaControllerBase
{
    private readonly IInventorySettingsAppService _inventorySettingsAppService;

    public InventorySettingsController(IInventorySettingsAppService inventorySettingsAppService)
    {
        _inventorySettingsAppService = inventorySettingsAppService;
    }

    /// <summary>Returns the current DB-backed inventory settings.</summary>
    [HttpGet]
    public async Task<InventorySettingsDto> GetAsync()
        => await _inventorySettingsAppService.GetAsync();

    /// <summary>Updates inventory settings (e.g. the auto-deduction toggle).</summary>
    [HttpPut]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<InventorySettingsDto> UpdateAsync([FromBody] InventorySettingsDto input)
        => await _inventorySettingsAppService.UpdateAsync(input);
}
