using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Pricing.Dtos;

namespace TeeNova.Pricing;

[ApiController]
[Route("api/pricing")]
public class PricingController : TeeNovaControllerBase
{
    private readonly IPricingAppService _pricingAppService;

    public PricingController(IPricingAppService pricingAppService)
    {
        _pricingAppService = pricingAppService;
    }

    /// <summary>
    /// Calculates a price breakdown for the given product/variant/print configuration.
    /// Quote-only: does not create or modify any records.
    /// </summary>
    [HttpPost("calculate")]
    public async Task<PriceCalculationResponseDto> CalculateAsync([FromBody] PriceCalculationRequestDto input)
        => await _pricingAppService.CalculateAsync(input);
}
