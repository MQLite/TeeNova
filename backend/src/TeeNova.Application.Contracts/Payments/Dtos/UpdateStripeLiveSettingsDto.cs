namespace TeeNova.Payments.Dtos;

/// <summary>
/// Admin write model for saving the Stripe LIVE-mode configuration (Jira 9908).
///
/// This endpoint is doubly guarded: it is Admin-only at the HTTP boundary, AND the app service rejects every
/// call unless the server-side unlock flag <c>OnlinePayments:AllowLiveModeConfiguration</c> is true. Secrets
/// are WRITE-ONLY: <see cref="SecretKey"/> and <see cref="WebhookSecret"/> are accepted here, encrypted, and
/// never returned by any read DTO. Both are optional on update — leave a secret null/blank to keep the
/// currently stored value (rotation-friendly). Only LIVE keys are accepted (sk_live_ / pk_live_ / whsec_);
/// test-prefixed and restricted (rk_*) keys are rejected by the app service.
///
/// Enabling a Live row here does NOT route public checkout to Live — the active runtime mode is a separate,
/// deliberate server-side selection (<c>OnlinePayments:ActiveMode</c>).
/// </summary>
public class UpdateStripeLiveSettingsDto
{
    /// <summary>
    /// Explicit confirmation phrase the caller must send to prove intent (defense against accidental live
    /// writes). The app service requires the exact value <c>ENABLE LIVE MODE</c>.
    /// </summary>
    public string? ConfirmationPhrase   { get; set; }

    /// <summary>When true, the Live row is enabled and both live secrets must be present (existing or supplied).</summary>
    public bool    IsEnabled            { get; set; }

    /// <summary>Currency — must be NZD in this phase.</summary>
    public string  Currency             { get; set; } = "NZD";

    /// <summary>Optional Stripe live publishable key (pk_live_...). Not secret; may be omitted.</summary>
    public string? PublishableKey       { get; set; }

    /// <summary>Write-only Stripe live secret key (sk_live_...). Null/blank keeps the existing stored value.</summary>
    public string? SecretKey            { get; set; }

    /// <summary>Write-only Stripe live webhook signing secret (whsec_...). Null/blank keeps the existing stored value.</summary>
    public string? WebhookSecret        { get; set; }

    /// <summary>Browser success return base URL — must resolve to /checkout/success with no query/fragment.</summary>
    public string? SuccessReturnBaseUrl { get; set; }

    /// <summary>Browser cancel return base URL — must resolve to /checkout/cancel with no query/fragment.</summary>
    public string? CancelReturnBaseUrl  { get; set; }

    // All omitted preserves the existing surcharge configuration. Supplying any field requires all five.
    public bool?    SurchargeEnabled                 { get; set; }
    public int?     SurchargePercentageBasisPoints   { get; set; }
    public decimal? SurchargeFixedAmount             { get; set; }
    public string?  SurchargeDisclosureText          { get; set; }
    public string?  SurchargeCalculationVersion      { get; set; }
}
