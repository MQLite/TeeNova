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

    /// <summary>
    /// Calculates a bounded set of independent quotes through the same authoritative pricing path.
    /// Correlation keys are response-routing data only and carry no pricing authority.
    /// </summary>
    Task<BatchPriceCalculationResponseDto> CalculateBatchAsync(BatchPriceCalculationRequestDto input);
}
