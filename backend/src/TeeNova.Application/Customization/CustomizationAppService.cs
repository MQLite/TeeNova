using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TeeNova.Customization.Dtos;
using TeeNova.PrintConfig;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Customization;

public class CustomizationAppService : ApplicationService, ICustomizationAppService
{
    // Kept for the enum fallback path
    private static readonly Dictionary<PrintPosition, string> DisplayLabels = new()
    {
        { PrintPosition.FrontCenter,  "Front Center"  },
        { PrintPosition.BackCenter,   "Back Center"   },
        { PrintPosition.LeftChest,    "Left Chest"    },
        { PrintPosition.RightChest,   "Right Chest"   },
        { PrintPosition.LeftSleeve,   "Left Sleeve"   },
        { PrintPosition.RightSleeve,  "Right Sleeve"  },
        { PrintPosition.NeckLabel,    "Neck Label"    },
    };

    private readonly IRepository<PrintArea, Guid> _printAreaRepository;

    public CustomizationAppService(IRepository<PrintArea, Guid> printAreaRepository)
    {
        _printAreaRepository = printAreaRepository;
    }

    public async Task<List<PrintPositionDto>> GetPrintPositionsAsync()
    {
        // Primary path: read from PrintArea records that have a legacy mapping
        var areas = await _printAreaRepository.GetListAsync(
            a => a.IsActive && a.LegacyPositionValue.HasValue);

        if (areas.Count > 0)
        {
            return areas
                .OrderBy(a => a.LegacyPositionValue)
                .Select(a => new PrintPositionDto
                {
                    Value        = a.LegacyPositionValue!.Value,
                    Name         = ((PrintPosition)a.LegacyPositionValue!.Value).ToString(),
                    DisplayLabel = a.Name,
                })
                .ToList();
        }

        // Fallback: in-memory enum (protects against missing seed data on fresh environments)
        return Enum.GetValues<PrintPosition>()
            .Select(p => new PrintPositionDto
            {
                Value        = (int)p,
                Name         = p.ToString(),
                DisplayLabel = DisplayLabels.GetValueOrDefault(p, p.ToString()),
            })
            .ToList();
    }
}
