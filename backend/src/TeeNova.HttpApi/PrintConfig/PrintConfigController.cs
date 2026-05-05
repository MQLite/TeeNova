using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using TeeNova.PrintConfig.Dtos;

namespace TeeNova.PrintConfig;

[ApiController]
[Route("api/print-config")]
public class PrintConfigController : TeeNovaControllerBase
{
    private readonly IPrintConfigAppService _printConfigAppService;

    public PrintConfigController(IPrintConfigAppService printConfigAppService)
    {
        _printConfigAppService = printConfigAppService;
    }

    // ── PrintArea ──────────────────────────────────────────────────────────────

    /// <summary>Returns print areas. Pass isActive=false or omit for all records.</summary>
    [HttpGet("areas")]
    public async Task<List<PrintAreaDto>> GetAreasAsync([FromQuery] bool? isActive = true)
        => await _printConfigAppService.GetAreasAsync(isActive);

    /// <summary>Returns a single print area by id.</summary>
    [HttpGet("areas/{id:guid}")]
    public async Task<PrintAreaDto> GetAreaAsync(Guid id)
        => await _printConfigAppService.GetAreaAsync(id);

    /// <summary>Creates a new print area.</summary>
    [HttpPost("areas")]
    public async Task<PrintAreaDto> CreateAreaAsync([FromBody] CreateUpdatePrintAreaDto input)
        => await _printConfigAppService.CreateAreaAsync(input);

    /// <summary>Updates an existing print area.</summary>
    [HttpPut("areas/{id:guid}")]
    public async Task<PrintAreaDto> UpdateAreaAsync(Guid id, [FromBody] CreateUpdatePrintAreaDto input)
        => await _printConfigAppService.UpdateAreaAsync(id, input);

    /// <summary>Deactivates a print area (sets IsActive = false).</summary>
    [HttpDelete("areas/{id:guid}")]
    public async Task DeleteAreaAsync(Guid id)
        => await _printConfigAppService.DeleteAreaAsync(id);

    // ── PrintSize ──────────────────────────────────────────────────────────────

    /// <summary>Returns print sizes. Pass isActive=false or omit for all records.</summary>
    [HttpGet("sizes")]
    public async Task<List<PrintSizeDto>> GetSizesAsync([FromQuery] bool? isActive = true)
        => await _printConfigAppService.GetSizesAsync(isActive);

    /// <summary>Returns a single print size by id.</summary>
    [HttpGet("sizes/{id:guid}")]
    public async Task<PrintSizeDto> GetSizeAsync(Guid id)
        => await _printConfigAppService.GetSizeAsync(id);

    /// <summary>Creates a new print size.</summary>
    [HttpPost("sizes")]
    public async Task<PrintSizeDto> CreateSizeAsync([FromBody] CreateUpdatePrintSizeDto input)
        => await _printConfigAppService.CreateSizeAsync(input);

    /// <summary>Updates an existing print size.</summary>
    [HttpPut("sizes/{id:guid}")]
    public async Task<PrintSizeDto> UpdateSizeAsync(Guid id, [FromBody] CreateUpdatePrintSizeDto input)
        => await _printConfigAppService.UpdateSizeAsync(id, input);

    /// <summary>Deactivates a print size (sets IsActive = false).</summary>
    [HttpDelete("sizes/{id:guid}")]
    public async Task DeleteSizeAsync(Guid id)
        => await _printConfigAppService.DeleteSizeAsync(id);

    // ── PrintAreaSizeOption ────────────────────────────────────────────────────

    /// <summary>Returns allowed print sizes for a print area.</summary>
    [HttpGet("areas/{areaId:guid}/sizes")]
    public async Task<List<PrintAreaSizeOptionDto>> GetAreaSizesAsync(Guid areaId, [FromQuery] bool includeInactive = false)
        => await _printConfigAppService.GetAreaSizesAsync(areaId, includeInactive);

    /// <summary>Replaces the allowed print size list for a print area.</summary>
    [HttpPut("areas/{areaId:guid}/sizes")]
    public async Task<List<PrintAreaSizeOptionDto>> SetAreaSizesAsync(Guid areaId, [FromBody] List<SetPrintAreaSizeOptionInput> input)
        => await _printConfigAppService.SetAreaSizesAsync(areaId, input);
}
