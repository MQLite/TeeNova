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
    /// <summary>Returns the masked Stripe Test-mode configuration (a default disabled/unconfigured view if none saved yet).</summary>
    Task<PaymentProviderSettingDto> GetStripeAsync();

    /// <summary>
    /// Returns a combined masked overview of both Test and Live persisted settings plus the server-side
    /// Live-mode gating state (unlock flag, active runtime mode). Admin + Viewer; no secrets. (Jira 9908.)
    /// </summary>
    Task<PaymentSettingsOverviewDto> GetOverviewAsync();

    /// <summary>Saves (create or update) the Stripe Test-mode configuration. Admin-only. Rejects live keys/mode.</summary>
    Task<PaymentProviderSettingDto> UpdateStripeTestAsync(UpdateStripeTestSettingsDto input);

    /// <summary>
    /// Saves (create or update) the Stripe Live-mode configuration. Admin-only AND rejected unless the
    /// server-side unlock flag <c>OnlinePayments:AllowLiveModeConfiguration</c> is true. Requires the exact
    /// confirmation phrase and accepts only live keys (sk_live_/pk_live_/whsec_). (Jira 9908.)
    /// </summary>
    Task<PaymentProviderSettingDto> UpdateStripeLiveAsync(UpdateStripeLiveSettingsDto input);

    /// <summary>Disables Stripe Test-mode payments without discarding stored (encrypted) secrets. Admin-only.</summary>
    Task<PaymentProviderSettingDto> DisableStripeTestAsync();

    /// <summary>Disables Stripe Live-mode payments without discarding stored (encrypted) secrets. Admin-only. (Jira 9908.)</summary>
    Task<PaymentProviderSettingDto> DisableStripeLiveAsync();

    /// <summary>Runs static (offline) validation over the stored Stripe Test configuration and records the result. Admin-only.</summary>
    Task<StripeTestSettingsValidationResultDto> ValidateStripeTestAsync();
}
