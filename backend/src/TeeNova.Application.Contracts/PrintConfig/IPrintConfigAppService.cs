using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.PrintConfig.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.PrintConfig;

public interface IPrintConfigAppService : IApplicationService
{
    // ── PrintArea ──────────────────────────────────────────────────────────────
    Task<List<PrintAreaDto>> GetAreasAsync(bool? isActive = true);
    Task<PrintAreaDto>       GetAreaAsync(Guid id);
    Task<PrintAreaDto>       CreateAreaAsync(CreateUpdatePrintAreaDto input);
    Task<PrintAreaDto>       UpdateAreaAsync(Guid id, CreateUpdatePrintAreaDto input);
    Task                     DeleteAreaAsync(Guid id);

    // ── PrintSize ──────────────────────────────────────────────────────────────
    Task<List<PrintSizeDto>> GetSizesAsync(bool? isActive = true);
    Task<PrintSizeDto>       GetSizeAsync(Guid id);
    Task<PrintSizeDto>       CreateSizeAsync(CreateUpdatePrintSizeDto input);
    Task<PrintSizeDto>       UpdateSizeAsync(Guid id, CreateUpdatePrintSizeDto input);
    Task                     DeleteSizeAsync(Guid id);

    // ── PrintAreaSizeOption ────────────────────────────────────────────────────
    Task<List<PrintAreaSizeOptionDto>> GetAreaSizesAsync(Guid areaId, bool includeInactive = false);
    Task<List<PrintAreaSizeOptionDto>> SetAreaSizesAsync(Guid areaId, List<SetPrintAreaSizeOptionInput> input);
}
