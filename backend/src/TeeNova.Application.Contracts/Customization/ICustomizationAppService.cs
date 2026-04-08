using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Customization.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Customization;

public interface ICustomizationAppService : IApplicationService
{
    Task<List<PrintPositionDto>> GetPrintPositionsAsync();
}
