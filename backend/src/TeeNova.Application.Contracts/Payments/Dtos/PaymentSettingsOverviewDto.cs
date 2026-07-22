namespace TeeNova.Payments.Dtos;

/// <summary>
/// Combined, masked admin overview of persisted payment provider settings for both modes plus the
/// server-side Live-mode gating state (Jira 9908). Contains NO secret material or ciphertext — each mode is a
/// <see cref="PaymentProviderSettingDto"/> (configured/last-4 flags only). Safe for Admin and Viewer reads.
/// </summary>
public class PaymentSettingsOverviewDto
{
    /// <summary>Masked Stripe Test-mode settings (default disabled/unconfigured view when none saved).</summary>
    public PaymentProviderSettingDto Test { get; set; } = new();

    /// <summary>Masked Stripe Live-mode settings (default disabled/unconfigured view when none saved).</summary>
    public PaymentProviderSettingDto Live { get; set; } = new();

    /// <summary>
    /// Whether the server-side unlock flag (<c>OnlinePayments:AllowLiveModeConfiguration</c>) is enabled.
    /// When false the Live panel is locked and the API rejects Live writes.
    /// </summary>
    public bool                      LiveModeConfigurationUnlocked { get; set; }

    /// <summary>The mode public checkout/webhook currently resolve at runtime (fail-closed to Test).</summary>
    public PaymentProviderMode       ActiveMode                    { get; set; } = PaymentProviderMode.Test;

    /// <summary>Convenience: true when <see cref="ActiveMode"/> is Live.</summary>
    public bool                      ActiveModeIsLive              { get; set; }

    /// <summary>Where the active-mode selection comes from (server config) — for admin display/audit.</summary>
    public string                    ActiveModeSource              { get; set; } = "ServerConfig";

    /// <summary>The exact confirmation phrase the Live save endpoint requires (surfaced so the UI can gate on it).</summary>
    public string                    LiveConfirmationPhrase        { get; set; } = "ENABLE LIVE MODE";
}
