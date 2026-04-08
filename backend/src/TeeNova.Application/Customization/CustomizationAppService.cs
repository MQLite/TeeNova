using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TeeNova.Customization.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Customization;

public class CustomizationAppService : ApplicationService, ICustomizationAppService
{
    private static readonly Dictionary<PrintPosition, string> DisplayLabels = new()
    {
        { PrintPosition.FrontCenter, "Front Center" },
        { PrintPosition.BackCenter, "Back Center" },
        { PrintPosition.LeftChest, "Left Chest" },
        { PrintPosition.RightChest, "Right Chest" },
        { PrintPosition.LeftSleeve, "Left Sleeve" },
        { PrintPosition.RightSleeve, "Right Sleeve" },
        { PrintPosition.NeckLabel, "Neck Label" },
    };

    public Task<List<PrintPositionDto>> GetPrintPositionsAsync()
    {
        var result = Enum.GetValues<PrintPosition>()
            .Select(p => new PrintPositionDto
            {
                Value = (int)p,
                Name = p.ToString(),
                DisplayLabel = DisplayLabels.GetValueOrDefault(p, p.ToString())
            })
            .ToList();

        return Task.FromResult(result);
    }
}
