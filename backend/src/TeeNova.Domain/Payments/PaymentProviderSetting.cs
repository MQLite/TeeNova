using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Payments;

/// <summary>
/// Persisted, admin-managed configuration for a real online payment provider (Jira 9902) — the
/// WordPress/WooCommerce-style "settings in the database" model. Rows are keyed by (provider, mode); Stripe
/// in <see cref="PaymentProviderMode.Test"/> and, when the server-side unlock is enabled (Jira 9908),
/// <see cref="PaymentProviderMode.Live"/> are supported.
///
/// Secret material (Stripe secret key, webhook signing secret) is stored ONLY as ciphertext
/// (<see cref="SecretKeyCipherText"/>, <see cref="WebhookSecretCipherText"/>) encrypted by the application
/// encryption service; the encryption key lives in configuration/user-secrets, NEVER in this table. Only a
/// non-secret last-4 fragment is kept for masked display. This entity never exposes plaintext secrets and
/// its DTO projection never includes ciphertext.
///
/// The entity is mode-agnostic and enforces only structural invariants (Stripe provider; an enabled row must
/// carry both secrets). Whether a Live row may be created/enabled at all is gated OUTSIDE the domain, by the
/// app service reading the <c>OnlinePayments:AllowLiveModeConfiguration</c> unlock flag — so a Live row can
/// never be persisted through the admin surface while the server keeps live configuration locked.
/// </summary>
public class PaymentProviderSetting : FullAuditedAggregateRoot<Guid>
{
    public const int     DefaultSurchargePercentageBasisPoints = StripeSurchargeDefaults.PercentageBasisPoints;
    public const decimal DefaultSurchargeFixedAmount           = StripeSurchargeDefaults.FixedAmount;
    public const int     MaxSurchargeDisclosureLength          = StripeSurchargeDefaults.MaxDisclosureTextLength;
    public const string  DefaultSurchargeDisclosureText        = StripeSurchargeDefaults.DisclosureText;

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

    public bool                             SurchargeEnabled                 { get; private set; }
    public int                              SurchargePercentageBasisPoints   { get; private set; }
    public decimal                          SurchargeFixedAmount             { get; private set; }
    public string                           SurchargeDisclosureText          { get; private set; } = DefaultSurchargeDisclosureText;
    public string                           SurchargeCalculationVersion      { get; private set; } = StripeSurchargeCalculator.CurrentCalculationVersion;

    protected PaymentProviderSetting() { }

    public PaymentProviderSetting(Guid id, PaymentProvider provider, PaymentProviderMode mode) : base(id)
    {
        if (provider != PaymentProvider.Stripe)
            throw new ArgumentException(
                "Only the Stripe provider is supported for persisted settings in this phase.", nameof(provider));

        // Live-mode gating is enforced by the app service via the server-side unlock flag (Jira 9908);
        // the domain accepts either mode but only ever the Stripe provider.
        Provider             = provider;
        Mode                 = mode;
        IsEnabled            = false;
        Currency             = "NZD";
        LastValidationStatus = PaymentProviderValidationStatus.NotValidated;
        SurchargeEnabled               = false;
        SurchargePercentageBasisPoints = DefaultSurchargePercentageBasisPoints;
        SurchargeFixedAmount           = DefaultSurchargeFixedAmount;
        SurchargeDisclosureText        = DefaultSurchargeDisclosureText;
        SurchargeCalculationVersion    = StripeSurchargeCalculator.CurrentCalculationVersion;
    }

    public bool HasSecretKey     => !string.IsNullOrWhiteSpace(SecretKeyCipherText);
    public bool HasWebhookSecret => !string.IsNullOrWhiteSpace(WebhookSecretCipherText);

    /// <summary>Applies non-secret Stripe configuration (currency, publishable key, return URLs) — mode-agnostic.</summary>
    public void ConfigureStripe(
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

    /// <summary>Atomically applies structurally valid Stripe surcharge settings for this provider mode.</summary>
    public void ConfigureSurcharge(
        bool    enabled,
        int     percentageBasisPoints,
        decimal fixedAmount,
        string  disclosureText,
        string  calculationVersion)
    {
        if (percentageBasisPoints < 0 || percentageBasisPoints >= 10_000)
            throw new ArgumentOutOfRangeException(
                nameof(percentageBasisPoints),
                percentageBasisPoints,
                "Percentage basis points must be between 0 and 9,999.");

        if (fixedAmount < 0 || fixedAmount != decimal.Round(fixedAmount, 2, MidpointRounding.ToEven))
            throw new ArgumentOutOfRangeException(
                nameof(fixedAmount), fixedAmount, "Fixed amount must be non-negative and exactly cent-aligned.");

        if (string.IsNullOrWhiteSpace(disclosureText))
            throw new ArgumentException("Disclosure text is required.", nameof(disclosureText));

        var normalizedDisclosure = disclosureText.Trim();
        if (normalizedDisclosure.Length > MaxSurchargeDisclosureLength)
            throw new ArgumentException(
                $"Disclosure text must not exceed {MaxSurchargeDisclosureLength} characters.",
                nameof(disclosureText));

        if (!string.Equals(
                calculationVersion?.Trim(),
                StripeSurchargeCalculator.CurrentCalculationVersion,
                StringComparison.Ordinal))
        {
            throw new ArgumentException("Unsupported surcharge calculation version.", nameof(calculationVersion));
        }

        SurchargeEnabled               = enabled;
        SurchargePercentageBasisPoints = percentageBasisPoints;
        SurchargeFixedAmount           = fixedAmount;
        SurchargeDisclosureText        = normalizedDisclosure;
        SurchargeCalculationVersion    = StripeSurchargeCalculator.CurrentCalculationVersion;
    }

    /// <summary>
    /// Returns a safe machine-readable validation code for an enabled persisted surcharge, or null when
    /// disabled/valid. This also defends readiness/runtime resolution against data that bypassed domain writes.
    /// </summary>
    public string? GetSurchargeValidationCode()
    {
        if (!SurchargeEnabled)
            return null;

        if (SurchargePercentageBasisPoints < 0 || SurchargePercentageBasisPoints >= 10_000)
            return "SurchargeRateInvalid";

        if (SurchargeFixedAmount < 0 ||
            SurchargeFixedAmount != decimal.Round(SurchargeFixedAmount, 2, MidpointRounding.ToEven))
            return "SurchargeFixedAmountInvalid";

        if (string.IsNullOrWhiteSpace(SurchargeDisclosureText))
            return "SurchargeDisclosureMissing";

        if (SurchargeDisclosureText.Trim().Length > MaxSurchargeDisclosureLength)
            return "SurchargeDisclosureInvalid";

        if (!string.Equals(
                SurchargeCalculationVersion,
                StripeSurchargeCalculator.CurrentCalculationVersion,
                StringComparison.Ordinal))
            return "SurchargeCalculationVersionUnsupported";

        if (!string.Equals(Currency, "NZD", StringComparison.Ordinal))
            return "SurchargeCurrencyInvalid";

        return null;
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
