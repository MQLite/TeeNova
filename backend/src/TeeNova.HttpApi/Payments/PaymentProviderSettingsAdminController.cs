using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using TeeNova.Payments.Dtos;

namespace TeeNova.Payments;

/// <summary>
/// Admin surface for persisted online payment provider settings (Jira 9902).
///
/// Read (GET) is available to any authenticated admin-panel user (Admin or Viewer) and returns MASKED status
/// only — never a secret. Writes (save/disable/validate) are restricted to <see cref="TeeNovaRoles.Admin"/>.
/// The app is never issued customer tokens, so none of this is reachable anonymously. Secrets are write-only
/// and encrypted at rest; no action here reveals, returns, or logs a plaintext secret. Live mode is rejected.
/// </summary>
[ApiController]
[Route("api/admin/payment-provider-settings")]
[Authorize]
public class PaymentProviderSettingsAdminController : TeeNovaControllerBase
{
    private readonly IPaymentProviderSettingsAppService _appService;

    public PaymentProviderSettingsAdminController(IPaymentProviderSettingsAppService appService)
    {
        _appService = appService;
    }

    /// <summary>GET — masked Stripe configuration status (Admin + Viewer).</summary>
    [HttpGet]
    public Task<PaymentProviderSettingDto> GetStripeAsync()
        => _appService.GetStripeAsync();

    /// <summary>PUT — save the Stripe Test-mode configuration (Admin only). Rejects live keys/mode.</summary>
    [HttpPut("stripe-test")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<PaymentProviderSettingDto> UpdateStripeTestAsync([FromBody] UpdateStripeTestSettingsDto input)
        => _appService.UpdateStripeTestAsync(input);

    /// <summary>POST — disable Stripe online payments without discarding stored secrets (Admin only).</summary>
    [HttpPost("stripe-test/disable")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<PaymentProviderSettingDto> DisableStripeTestAsync()
        => _appService.DisableStripeTestAsync();

    /// <summary>POST — run static (offline) validation over the stored Stripe configuration (Admin only).</summary>
    [HttpPost("stripe-test/validate")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public Task<StripeTestSettingsValidationResultDto> ValidateStripeTestAsync()
        => _appService.ValidateStripeTestAsync();
}
