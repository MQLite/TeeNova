namespace TeeNova.Payments.Dtos;

/// <summary>
/// Admin write model for saving the Stripe Test-mode configuration (Jira 9902).
///
/// Secrets are WRITE-ONLY: <see cref="SecretKey"/> and <see cref="WebhookSecret"/> are accepted here, encrypted,
/// and never returned by any read DTO. Both are optional on update — leave a secret null/blank to keep the
/// currently stored value (rotation-friendly). Only test keys are accepted; live keys are rejected by the app
/// service. There is intentionally no Mode field — Test is the only mode this endpoint configures.
/// </summary>
public class UpdateStripeTestSettingsDto
{
    /// <summary>When true, the provider is enabled and both secrets must be present (existing or supplied).</summary>
    public bool    IsEnabled            { get; set; }

    /// <summary>Currency — must be NZD in this phase.</summary>
    public string  Currency             { get; set; } = "NZD";

    /// <summary>Optional Stripe test publishable key (pk_test_...). Not secret; may be omitted.</summary>
    public string? PublishableKey       { get; set; }

    /// <summary>Write-only Stripe test secret key (sk_test_...). Null/blank keeps the existing stored value.</summary>
    public string? SecretKey            { get; set; }

    /// <summary>Write-only Stripe webhook signing secret (whsec_...). Null/blank keeps the existing stored value.</summary>
    public string? WebhookSecret        { get; set; }

    /// <summary>Browser success return base URL — must resolve to /checkout/success with no query/fragment.</summary>
    public string? SuccessReturnBaseUrl { get; set; }

    /// <summary>Browser cancel return base URL — must resolve to /checkout/cancel with no query/fragment.</summary>
    public string? CancelReturnBaseUrl  { get; set; }
}
