using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Payments;

/// <summary>
/// Persisted, admin-managed configuration for a real online payment provider (Jira 9902) — the
/// WordPress/WooCommerce-style "settings in the database" model. In this phase the only supported row is
/// Stripe in <see cref="PaymentProviderMode.Test"/> mode.
///
/// Secret material (Stripe secret key, webhook signing secret) is stored ONLY as ciphertext
/// (<see cref="SecretKeyCipherText"/>, <see cref="WebhookSecretCipherText"/>) encrypted by the application
/// encryption service; the encryption key lives in configuration/user-secrets, NEVER in this table. Only a
/// non-secret last-4 fragment is kept for masked display. This entity never exposes plaintext secrets and
/// its DTO projection never includes ciphertext.
///
/// Live mode is intentionally rejected: the constructor refuses <see cref="PaymentProviderMode.Live"/> and
/// non-Stripe providers, so a live configuration can never be persisted here.
/// </summary>
public class PaymentProviderSetting : FullAuditedAggregateRoot<Guid>
{
    public PaymentProvider                  Provider                  { get; private set; }
    public PaymentProviderMode              Mode                      { get; private set; }
    public bool                             IsEnabled                 { get; private set; }
    public string                           Currency                  { get; private set; } = "NZD";

    public string?                          PublishableKey            { get; private set; }

    // Encrypted at rest — never plaintext, never returned by any DTO, never logged.
    public string?                          SecretKeyCipherText       { get; private set; }
    public string?                          WebhookSecretCipherText   { get; private set; }

    // Non-secret masking fragments for admin display only.
    public string?                          SecretKeyLast4            { get; private set; }
    public string?                          WebhookSecretLast4        { get; private set; }

    public string?                          SuccessReturnBaseUrl      { get; private set; }
    public string?                          CancelReturnBaseUrl       { get; private set; }

    public DateTime?                        LastValidatedAt           { get; private set; }
    public PaymentProviderValidationStatus  LastValidationStatus      { get; private set; }
    public string?                          LastValidationMessageCode { get; private set; }

    protected PaymentProviderSetting() { }

    public PaymentProviderSetting(Guid id, PaymentProvider provider, PaymentProviderMode mode) : base(id)
    {
        if (provider != PaymentProvider.Stripe)
            throw new ArgumentException(
                "Only the Stripe provider is supported for persisted settings in this phase.", nameof(provider));

        // Fail-closed: a Live configuration can never be constructed/persisted in Jira 9902.
        if (mode != PaymentProviderMode.Test)
            throw new ArgumentException(
                "Only Test mode may be persisted. Live mode is intentionally blocked.", nameof(mode));

        Provider             = provider;
        Mode                 = mode;
        IsEnabled            = false;
        Currency             = "NZD";
        LastValidationStatus = PaymentProviderValidationStatus.NotValidated;
    }

    public bool HasSecretKey     => !string.IsNullOrWhiteSpace(SecretKeyCipherText);
    public bool HasWebhookSecret => !string.IsNullOrWhiteSpace(WebhookSecretCipherText);

    /// <summary>Applies non-secret Stripe Test-mode configuration (currency, publishable key, return URLs).</summary>
    public void ConfigureStripeTest(
        string  currency,
        string? publishableKey,
        string? successReturnBaseUrl,
        string? cancelReturnBaseUrl)
    {
        Check.NotNullOrWhiteSpace(currency, nameof(currency));

        Currency             = currency.Trim().ToUpperInvariant();
        PublishableKey       = Normalize(publishableKey);
        SuccessReturnBaseUrl = Normalize(successReturnBaseUrl);
        CancelReturnBaseUrl  = Normalize(cancelReturnBaseUrl);
    }

    /// <summary>Stores an already-encrypted secret key plus its non-secret last-4 fragment (rotation-safe).</summary>
    public void SetSecretKey(string cipherText, string last4)
    {
        Check.NotNullOrWhiteSpace(cipherText, nameof(cipherText));
        SecretKeyCipherText = cipherText;
        SecretKeyLast4      = Normalize(last4);
    }

    /// <summary>Stores an already-encrypted webhook secret plus its non-secret last-4 fragment (rotation-safe).</summary>
    public void SetWebhookSecret(string cipherText, string last4)
    {
        Check.NotNullOrWhiteSpace(cipherText, nameof(cipherText));
        WebhookSecretCipherText = cipherText;
        WebhookSecretLast4      = Normalize(last4);
    }

    /// <summary>
    /// Enables the provider. Fails closed if either secret is absent — an enabled row must always be able to
    /// create a checkout session and verify a webhook.
    /// </summary>
    public void Enable()
    {
        if (Mode != PaymentProviderMode.Test)
            throw new InvalidOperationException("Only Test mode may be enabled in this phase.");

        if (!HasSecretKey || !HasWebhookSecret)
            throw new InvalidOperationException(
                "Cannot enable Stripe Test mode without both a secret key and a webhook secret configured.");

        IsEnabled = true;
    }

    /// <summary>Disables the provider without discarding stored (encrypted) secrets, so it can be re-enabled.</summary>
    public void Disable() => IsEnabled = false;

    /// <summary>Records the outcome of the last static validation (non-secret status/code only).</summary>
    public void RecordValidation(PaymentProviderValidationStatus status, string? messageCode, DateTime whenUtc)
    {
        LastValidationStatus      = status;
        LastValidationMessageCode = Normalize(messageCode);
        LastValidatedAt           = whenUtc;
    }

    private static string? Normalize(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
