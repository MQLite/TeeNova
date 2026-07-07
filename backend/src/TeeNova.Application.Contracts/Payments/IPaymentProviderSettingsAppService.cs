using System.Threading.Tasks;
using TeeNova.Payments.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Payments;

/// <summary>
/// Admin management surface for persisted online payment provider settings (Jira 9902). In this phase it
/// manages a single Stripe Test-mode configuration.
///
/// Reads return only masked, non-secret state (Admin + Viewer). Writes (save/disable/validate) are Admin-only
/// and enforced at the HTTP boundary. Secrets are write-only and encrypted at rest; no method on this service
/// ever returns, reveals, or logs a plaintext secret. Live mode and live keys are rejected.
/// </summary>
public interface IPaymentProviderSettingsAppService : IApplicationService
{
    /// <summary>Returns the masked Stripe configuration (a default disabled/unconfigured view if none saved yet).</summary>
    Task<PaymentProviderSettingDto> GetStripeAsync();

    /// <summary>Saves (create or update) the Stripe Test-mode configuration. Admin-only. Rejects live keys/mode.</summary>
    Task<PaymentProviderSettingDto> UpdateStripeTestAsync(UpdateStripeTestSettingsDto input);

    /// <summary>Disables Stripe online payments without discarding stored (encrypted) secrets. Admin-only.</summary>
    Task<PaymentProviderSettingDto> DisableStripeTestAsync();

    /// <summary>Runs static (offline) validation over the stored Stripe configuration and records the result. Admin-only.</summary>
    Task<StripeTestSettingsValidationResultDto> ValidateStripeTestAsync();
}
