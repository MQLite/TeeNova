using System.Collections.Generic;

namespace TeeNova.Payments.Dtos;

/// <summary>
/// Result of a static (offline) readiness validation of the persisted Stripe Test-mode configuration
/// (Jira 9902 base, Jira 9903 readiness codes). Validation performs key-prefix and return-URL shape checks
/// only — it never makes a live Stripe API call and never echoes secret values. Messages are field/reason
/// codes, not values. Runtime prerequisites (Stripe CLI, SMTP, manual checkout) are NOT tested here.
/// </summary>
public class StripeTestSettingsValidationResultDto
{
    public PaymentProviderValidationStatus Status                  { get; set; }

    /// <summary>Non-secret machine code describing the outcome (e.g. Valid, MissingSecretKey, ReadyForManualTestModeSmoke).</summary>
    public string?                         MessageCode             { get; set; }

    public bool                            IsEnabled               { get; set; }
    public bool                            SecretKeyConfigured     { get; set; }
    public bool                            WebhookSecretConfigured { get; set; }
    public bool                            ReturnUrlsValid         { get; set; }

    // ── Readiness signals (Jira 9903) ────────────────────────────────────────────────────────────────
    public bool                            CanCreateCheckoutSession       { get; set; }
    public bool                            EncryptionPassphraseConfigured { get; set; }

    /// <summary>Always true — live mode is intentionally blocked in this phase.</summary>
    public bool                            LiveModeBlocked                { get; set; } = true;

    /// <summary>Safe machine codes for actionable prerequisites still missing (never secrets/values).</summary>
    public List<string>                    MissingPrerequisites           { get; set; } = new();
}
