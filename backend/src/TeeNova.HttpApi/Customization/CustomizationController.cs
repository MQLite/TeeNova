using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Customization.Dtos;

namespace TeeNova.Customization;

[ApiController]
[Route("api/customization")]
public class CustomizationController : TeeNovaControllerBase
{
    private readonly ICustomizationAppService _customizationAppService;

    public CustomizationController(ICustomizationAppService customizationAppService)
    {
        _customizationAppService = customizationAppService;
    }

    [HttpGet("print-positions")]
    public async Task<List<PrintPositionDto>> GetPrintPositionsAsync()
        => await _customizationAppService.GetPrintPositionsAsync();
}
