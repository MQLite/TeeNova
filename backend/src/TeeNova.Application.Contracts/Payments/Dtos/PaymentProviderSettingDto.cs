using System;
using System.Collections.Generic;

namespace TeeNova.Payments.Dtos;

/// <summary>
/// Masked, admin-facing projection of the persisted Stripe payment configuration plus safe readiness
/// signals (Jira 9902 base, Jira 9903 readiness fields).
///
/// This DTO deliberately contains NO secret material: no secret key, no webhook secret, no ciphertext, and
/// no decrypt/reveal field. Only booleans (<see cref="SecretKeyConfigured"/>/<see cref="WebhookSecretConfigured"/>)
/// and non-secret last-4 fragments are exposed so the admin panel can show configured/missing state without
/// ever handling a secret. Safe for Admin and Viewer reads; never returned anonymously.
/// </summary>
public class PaymentProviderSettingDto
{
    public PaymentProvider                 Provider                  { get; set; }
    public PaymentProviderMode             Mode                      { get; set; }
    public bool                            IsEnabled                 { get; set; }
    public string                          Currency                  { get; set; } = "NZD";

    /// <summary>Publishable key is not secret; still only the test key is ever stored. May be null/omitted.</summary>
    public string?                         PublishableKey            { get; set; }

    public bool                            SecretKeyConfigured       { get; set; }
    public string?                         SecretKeyLast4            { get; set; }

    public bool                            WebhookSecretConfigured   { get; set; }
    public string?                         WebhookSecretLast4        { get; set; }

    public string?                         SuccessReturnBaseUrl      { get; set; }
    public string?                         CancelReturnBaseUrl       { get; set; }

    public DateTime?                       LastValidatedAt           { get; set; }
    public PaymentProviderValidationStatus LastValidationStatus      { get; set; }
    public string?                         LastValidationMessageCode { get; set; }

    // ── Readiness signals (Jira 9903) — all safe/non-secret ──────────────────────────────────────────

    /// <summary>True when a persisted Stripe/Test settings row exists (vs. the default empty view).</summary>
    public bool                            IsConfigured                   { get; set; }

    /// <summary>Derived (no secrets read): enabled AND both secrets configured. Whether a checkout session could be created.</summary>
    public bool                            CanCreateCheckoutSession       { get; set; }

    /// <summary>Always true in this phase — live mode is intentionally blocked.</summary>
    public bool                            LiveModeBlocked                { get; set; } = true;

    /// <summary>Whether the application encryption passphrase (Encryption:PassPhrase) is configured. Safe boolean — never the value.</summary>
    public bool                            EncryptionPassphraseConfigured { get; set; }

    /// <summary>Provider webhook path the operator should register in Stripe (e.g. /api/payment-webhooks/stripe).</summary>
    public string                          WebhookEndpointPath            { get; set; } = string.Empty;

    /// <summary>Absolute webhook URL when the backend self URL is known/valid; otherwise null.</summary>
    public string?                         WebhookEndpointUrl             { get; set; }

    /// <summary>Where Stripe secrets are resolved from at runtime (DatabaseEncrypted).</summary>
    public string                          SecretsRuntimeSource           { get; set; } = "DatabaseEncrypted";

    /// <summary>Where currency and return URLs are resolved from at runtime (ServerAppSettings — 9811-validated).</summary>
    public string                          ConfigRuntimeSource            { get; set; } = "ServerAppSettings";

    /// <summary>Safe machine codes for actionable prerequisites still missing (never secrets/values).</summary>
    public List<string>                    MissingPrerequisites           { get; set; } = new();

    /// <summary>Overall readiness code (e.g. NotConfigured, MissingSecretKey, ConfiguredButDisabled, ReadyForManualTestModeSmoke).</summary>
    public string                          ReadinessCode                  { get; set; } = "NotConfigured";
}
