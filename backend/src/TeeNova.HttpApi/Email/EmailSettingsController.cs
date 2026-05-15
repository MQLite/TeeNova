using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Email.Dtos;

namespace TeeNova.Email;

[ApiController]
[Route("api/admin/email-settings")]
public class EmailSettingsController : TeeNovaControllerBase
{
    private readonly IEmailSettingsAppService _emailSettingsAppService;

    public EmailSettingsController(IEmailSettingsAppService emailSettingsAppService)
    {
        _emailSettingsAppService = emailSettingsAppService;
    }

    /// <summary>Returns the current admin-editable email notification settings.</summary>
    [HttpGet]
    public async Task<EmailSettingsDto> GetAsync()
        => await _emailSettingsAppService.GetAsync();

    /// <summary>Saves admin-editable email notification settings. Does not accept SMTP credentials.</summary>
    [HttpPut]
    public async Task<EmailSettingsDto> UpdateAsync([FromBody] EmailSettingsDto input)
        => await _emailSettingsAppService.UpdateAsync(input);
}
