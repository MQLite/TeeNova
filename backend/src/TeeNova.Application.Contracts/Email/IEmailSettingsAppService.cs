using System.Threading.Tasks;
using TeeNova.Email.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Email;

public interface IEmailSettingsAppService : IApplicationService
{
    Task<EmailSettingsDto> GetAsync();
    Task<EmailSettingsDto> UpdateAsync(EmailSettingsDto input);
}
