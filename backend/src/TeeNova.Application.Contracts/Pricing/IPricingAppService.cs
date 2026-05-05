using System.Threading.Tasks;
using TeeNova.Pricing.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Pricing;

public interface IPricingAppService : IApplicationService
{
    /// <summary>
    /// Calculates a price breakdown for the given product/variant/print configuration.
    /// Quote-only: no records are created or modified.
    /// </summary>
    Task<PriceCalculationResponseDto> CalculateAsync(PriceCalculationRequestDto input);
}
