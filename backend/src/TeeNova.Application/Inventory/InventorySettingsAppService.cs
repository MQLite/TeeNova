using System;
using System.Threading.Tasks;
using TeeNova.Inventory.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Inventory;

/// <summary>
/// Reads and writes the single DB-backed inventory settings row. When the row does not yet
/// exist, settings read as their safe defaults (auto-deduction OFF).
/// </summary>
public class InventorySettingsAppService : ApplicationService, IInventorySettingsAppService
{
    private readonly IRepository<InventorySettings, Guid> _settingsRepository;

    public InventorySettingsAppService(IRepository<InventorySettings, Guid> settingsRepository)
    {
        _settingsRepository = settingsRepository;
    }

    public async Task<InventorySettingsDto> GetAsync()
    {
        var db = await _settingsRepository.FindAsync(InventorySettings.SingletonId);
        return new InventorySettingsDto
        {
            AutoDeductOnPressedEnabled = db?.AutoDeductOnPressedEnabled ?? false,
            LastModificationTime       = db?.LastModificationTime,
        };
    }

    public async Task<InventorySettingsDto> UpdateAsync(InventorySettingsDto input)
    {
        var db = await _settingsRepository.FindAsync(InventorySettings.SingletonId);

        if (db == null)
        {
            db = new InventorySettings(InventorySettings.SingletonId)
            {
                AutoDeductOnPressedEnabled = input.AutoDeductOnPressedEnabled,
                LastModificationTime       = Clock.Now,
                LastModifierId             = CurrentUser?.Id,
            };
            await _settingsRepository.InsertAsync(db, autoSave: true);
        }
        else
        {
            db.AutoDeductOnPressedEnabled = input.AutoDeductOnPressedEnabled;
            db.LastModificationTime       = Clock.Now;
            db.LastModifierId             = CurrentUser?.Id;
            await _settingsRepository.UpdateAsync(db, autoSave: true);
        }

        return await GetAsync();
    }
}
