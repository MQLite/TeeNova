using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Pricing.Dtos;

namespace TeeNova.Pricing;

// Quote-only price calculation used by the public storefront (product detail, cart, customize).
// Explicitly [AllowAnonymous] to document the public intent — it creates/modifies no records.
[ApiController]
[Route("api/pricing")]
[AllowAnonymous]
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
