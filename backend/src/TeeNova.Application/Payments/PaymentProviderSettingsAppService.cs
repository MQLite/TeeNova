using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TeeNova.Payments.Dtos;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Security.Encryption;

namespace TeeNova.Payments;

/// <summary>
/// Admin management service for the persisted Stripe Test-mode configuration (Jira 9902).
///
/// Secrets are accepted write-only, encrypted with the application <see cref="IStringEncryptionService"/>
/// before persistence, and are NEVER returned, revealed, or logged. Reads project a masked DTO
/// (configured/last-4 only). Live mode and live/restricted keys are rejected. Authorization is enforced at
/// the HTTP boundary (Admin for writes; Admin + Viewer for the masked read).
/// </summary>
public class PaymentProviderSettingsAppService : ApplicationService, IPaymentProviderSettingsAppService
{
    // The Stripe webhook path (PaymentWebhookController route "api/payment-webhooks/{provider}").
    private const string StripeWebhookPath = "/api/payment-webhooks/stripe";

    private readonly IRepository<PaymentProviderSetting, Guid>     _repository;
    private readonly IStringEncryptionService                     _encryption;
    private readonly IConfiguration                               _configuration;
    private readonly ILogger<PaymentProviderSettingsAppService>   _logger;

    public PaymentProviderSettingsAppService(
        IRepository<PaymentProviderSetting, Guid>   repository,
        IStringEncryptionService                    encryption,
        IConfiguration                              configuration,
        ILogger<PaymentProviderSettingsAppService>  logger)
    {
        _repository    = repository;
        _encryption    = encryption;
        _configuration = configuration;
        _logger        = logger;
    }

    public async Task<PaymentProviderSettingDto> GetStripeAsync()
    {
        var setting = await FindStripeTestAsync();
        return BuildDto(setting);
    }

    public async Task<PaymentProviderSettingDto> UpdateStripeTestAsync(UpdateStripeTestSettingsDto input)
    {
        Check.NotNull(input, nameof(input));

        // ── Static validation (no live Stripe API call in this phase) ────────────────────────────────
        var currency = (input.Currency ?? string.Empty).Trim().ToUpperInvariant();
        if (currency != "NZD")
            throw new UserFriendlyException("Currency must be NZD in this phase.");

        // Reject live/restricted keys outright — Live mode is intentionally blocked (Jira 9902).
        RejectLiveKey(input.SecretKey,     "Secret key");
        RejectLiveKey(input.PublishableKey,"Publishable key");
        RejectLiveKey(input.WebhookSecret, "Webhook secret");

        var secretKeyProvided     = !string.IsNullOrWhiteSpace(input.SecretKey);
        var webhookSecretProvided = !string.IsNullOrWhiteSpace(input.WebhookSecret);
        var publishableProvided   = !string.IsNullOrWhiteSpace(input.PublishableKey);

        if (secretKeyProvided && !StripeTestKeyRules.IsValidTestSecretKey(input.SecretKey))
            throw new UserFriendlyException("Secret key must be a Stripe test key beginning with 'sk_test_' and contain no whitespace.");

        if (webhookSecretProvided && !StripeTestKeyRules.IsValidWebhookSecret(input.WebhookSecret))
            throw new UserFriendlyException("Webhook secret must begin with 'whsec_' and contain no whitespace.");

        if (publishableProvided && !StripeTestKeyRules.IsValidTestPublishableKey(input.PublishableKey))
            throw new UserFriendlyException("Publishable key must be a Stripe test key beginning with 'pk_test_'.");

        ValidateReturnUrl(input.SuccessReturnBaseUrl, "/checkout/success", "Success return URL");
        ValidateReturnUrl(input.CancelReturnBaseUrl,  "/checkout/cancel",  "Cancel return URL");

        // ── Load or create the single Stripe/Test row ────────────────────────────────────────────────
        var setting = await FindStripeTestAsync();
        var isNew   = setting is null;
        setting ??= new PaymentProviderSetting(GuidGenerator.Create(), PaymentProvider.Stripe, PaymentProviderMode.Test);

        setting.ConfigureStripeTest(
            currency,
            publishableProvided ? input.PublishableKey!.Trim() : setting.PublishableKey,
            input.SuccessReturnBaseUrl,
            input.CancelReturnBaseUrl);

        // Encrypt-at-rest. Plaintext is held only transiently here; only ciphertext + last-4 reach the DB.
        if (secretKeyProvided)
        {
            var plain  = input.SecretKey!.Trim();
            var cipher = _encryption.Encrypt(plain)
                         ?? throw new UserFriendlyException("Failed to encrypt the secret key.");
            setting.SetSecretKey(cipher, StripeTestKeyRules.Last4(plain));
        }

        if (webhookSecretProvided)
        {
            var plain  = input.WebhookSecret!.Trim();
            var cipher = _encryption.Encrypt(plain)
                         ?? throw new UserFriendlyException("Failed to encrypt the webhook secret.");
            setting.SetWebhookSecret(cipher, StripeTestKeyRules.Last4(plain));
        }

        // Enable requires both secrets present (existing or just-supplied) — fail closed with a clear message.
        if (input.IsEnabled)
        {
            if (!setting.HasSecretKey)
                throw new UserFriendlyException("Cannot enable Stripe: a test secret key (sk_test_...) is required.");
            if (!setting.HasWebhookSecret)
                throw new UserFriendlyException("Cannot enable Stripe: a webhook signing secret (whsec_...) is required.");

            setting.Enable();
        }
        else
        {
            setting.Disable();
        }

        // Record the static readiness outcome alongside the save.
        var readiness = ComputeReadiness(setting);
        setting.RecordValidation(readiness.Status, readiness.Code, Clock.Now);

        if (isNew)
            await _repository.InsertAsync(setting, autoSave: true);
        else
            await _repository.UpdateAsync(setting, autoSave: true);

        // Safe, non-secret audit line: configured/enabled state and last-4 only.
        _logger.LogInformation(
            "[PaymentSettings] Stripe Test settings saved — Enabled: {Enabled}, SecretKey: {SecretState}, " +
            "WebhookSecret: {WebhookState}, Currency: {Currency}.",
            setting.IsEnabled,
            setting.HasSecretKey     ? $"configured(••••{setting.SecretKeyLast4})"     : "missing",
            setting.HasWebhookSecret ? $"configured(••••{setting.WebhookSecretLast4})" : "missing",
            setting.Currency);

        return BuildDto(setting);
    }

    public async Task<PaymentProviderSettingDto> DisableStripeTestAsync()
    {
        var setting = await FindStripeTestAsync();
        if (setting is null)
            return BuildDto(null);

        // Disable only flips the enabled flag — the encrypted secrets are intentionally retained so the
        // configuration can be re-enabled without re-entering keys. No secret is deleted here.
        setting.Disable();
        await _repository.UpdateAsync(setting, autoSave: true);

        _logger.LogInformation("[PaymentSettings] Stripe Test settings disabled by admin (secrets retained).");
        return BuildDto(setting);
    }

    public async Task<StripeTestSettingsValidationResultDto> ValidateStripeTestAsync()
    {
        var setting  = await FindStripeTestAsync();
        var readiness = ComputeReadiness(setting);

        // Persist the recorded outcome only when a row exists.
        if (setting is not null)
        {
            setting.RecordValidation(readiness.Status, readiness.Code, Clock.Now);
            await _repository.UpdateAsync(setting, autoSave: true);
        }

        return new StripeTestSettingsValidationResultDto
        {
            Status                         = readiness.Status,
            MessageCode                    = readiness.Code,
            IsEnabled                      = setting?.IsEnabled       ?? false,
            SecretKeyConfigured            = setting?.HasSecretKey     ?? false,
            WebhookSecretConfigured        = setting?.HasWebhookSecret ?? false,
            ReturnUrlsValid                = readiness.ReturnUrlsValid,
            CanCreateCheckoutSession       = readiness.CanCreate,
            EncryptionPassphraseConfigured = EncryptionPassphraseConfigured,
            LiveModeBlocked                = true,
            MissingPrerequisites           = readiness.Missing,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

    private async Task<PaymentProviderSetting?> FindStripeTestAsync()
    {
        var query = await _repository.GetQueryableAsync();
        return await query
            .Where(s => s.Provider == PaymentProvider.Stripe && s.Mode == PaymentProviderMode.Test)
            .FirstOrDefaultAsync();
    }

    // Whether the application encryption passphrase is explicitly configured (safe boolean — never the value).
    // When false, the ABP built-in default passphrase is in effect, which is acceptable only for local dev.
    private bool EncryptionPassphraseConfigured
        => !string.IsNullOrWhiteSpace(_configuration["Encryption:PassPhrase"]);

    private readonly record struct Readiness(
        string                          Code,
        List<string>                    Missing,
        bool                            CanCreate,
        bool                            ReturnUrlsValid,
        PaymentProviderValidationStatus Status);

    /// <summary>
    /// Static (offline) readiness evaluation — never calls Stripe, never touches secrets beyond the
    /// configured/last-4 flags already on the entity. Produces safe machine codes only.
    /// </summary>
    private Readiness ComputeReadiness(PaymentProviderSetting? setting)
    {
        var missing         = new List<string>();
        var encryptionReady = EncryptionPassphraseConfigured;

        if (setting is null)
        {
            missing.Add("NotConfigured");
            if (!encryptionReady) missing.Add("EncryptionPassphraseNotConfigured");
            return new Readiness("NotConfigured", missing, false, false, PaymentProviderValidationStatus.Invalid);
        }

        // Return URLs are OPTIONAL on the persisted row — when blank, checkout falls back to the
        // 9811-startup-validated appsettings return URLs. Blank is acceptable; a present-but-malformed URL
        // is invalid (and the save path already rejects those).
        var returnUrlsValid =
            IsBlankOrValidReturnUrl(setting.SuccessReturnBaseUrl, "/checkout/success") &&
            IsBlankOrValidReturnUrl(setting.CancelReturnBaseUrl,  "/checkout/cancel");

        if (!setting.HasSecretKey)     missing.Add("MissingSecretKey");
        if (!setting.HasWebhookSecret) missing.Add("MissingWebhookSecret");
        if (!returnUrlsValid)          missing.Add("InvalidReturnUrl");
        if (!setting.IsEnabled)        missing.Add("NotEnabled");
        // Advisory (not a hard blocker locally — the dev-default key still decrypts): surfaced as a warning.
        if (!encryptionReady)          missing.Add("EncryptionPassphraseNotConfigured");

        var configValid = setting.HasSecretKey && setting.HasWebhookSecret && returnUrlsValid;
        var canCreate   = configValid && setting.IsEnabled;

        string code;
        PaymentProviderValidationStatus status;
        if (!setting.HasSecretKey)          { code = "MissingSecretKey";      status = PaymentProviderValidationStatus.Invalid; }
        else if (!setting.HasWebhookSecret) { code = "MissingWebhookSecret";  status = PaymentProviderValidationStatus.Invalid; }
        else if (!returnUrlsValid)          { code = "InvalidReturnUrl";      status = PaymentProviderValidationStatus.Invalid; }
        else if (!setting.IsEnabled)        { code = "ConfiguredButDisabled"; status = PaymentProviderValidationStatus.Valid;   }
        else                                { code = "ReadyForManualTestModeSmoke"; status = PaymentProviderValidationStatus.Valid; }

        return new Readiness(code, missing, canCreate, returnUrlsValid, status);
    }

    /// <summary>Absolute webhook URL when a valid backend self URL is configured; otherwise null (safe — no secrets).</summary>
    private string? ResolveWebhookEndpointUrl()
    {
        var selfUrl = _configuration["App:SelfUrl"];
        if (string.IsNullOrWhiteSpace(selfUrl))
            return null;

        if (!Uri.TryCreate(selfUrl.Trim(), UriKind.Absolute, out var baseUri))
            return null;

        if (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps)
            return null;

        return $"{selfUrl.Trim().TrimEnd('/')}{StripeWebhookPath}";
    }

    private static void RejectLiveKey(string? value, string label)
    {
        if (StripeTestKeyRules.IsForbiddenLiveKey(value))
            throw new UserFriendlyException(
                $"{label} uses a live/restricted key prefix. Live mode is not permitted — use a Stripe test key only.");
    }

    /// <summary>Throws when a supplied return URL is not a safe absolute URL resolving to the expected path.</summary>
    private static void ValidateReturnUrl(string? value, string expectedPathSuffix, string label)
    {
        if (string.IsNullOrWhiteSpace(value))
            return; // Optional; runtime falls back to the 9811-validated appsettings return URLs.

        if (!IsValidReturnUrl(value, expectedPathSuffix))
            throw new UserFriendlyException(
                $"{label} must be an absolute http(s) URL ending in '{expectedPathSuffix}' with no query string or fragment.");
    }

    private static bool IsBlankOrValidReturnUrl(string? value, string expectedPathSuffix)
        => string.IsNullOrWhiteSpace(value) || IsValidReturnUrl(value, expectedPathSuffix);

    private static bool IsValidReturnUrl(string? value, string expectedPathSuffix)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri))
            return false;

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return false;

        // No query/fragment — the server appends its own ?orderId=&orderNumber=&provider= (9811 rule).
        if (!string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            return false;

        return uri.AbsolutePath.TrimEnd('/')
            .EndsWith(expectedPathSuffix, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Builds the masked read DTO (base fields + Jira 9903 readiness signals) for either the persisted row or
    /// the default "not configured" view. Contains no secret material or ciphertext — only configured/last-4
    /// flags and safe readiness codes.
    /// </summary>
    private PaymentProviderSettingDto BuildDto(PaymentProviderSetting? s)
    {
        var readiness = ComputeReadiness(s);

        var dto = new PaymentProviderSettingDto
        {
            Provider                  = PaymentProvider.Stripe,
            Mode                      = PaymentProviderMode.Test,
            IsEnabled                 = s?.IsEnabled ?? false,
            Currency                  = s?.Currency ?? "NZD",
            PublishableKey            = s?.PublishableKey,
            SecretKeyConfigured       = s?.HasSecretKey ?? false,
            SecretKeyLast4            = s?.SecretKeyLast4,
            WebhookSecretConfigured   = s?.HasWebhookSecret ?? false,
            WebhookSecretLast4        = s?.WebhookSecretLast4,
            SuccessReturnBaseUrl      = s?.SuccessReturnBaseUrl,
            CancelReturnBaseUrl       = s?.CancelReturnBaseUrl,
            LastValidatedAt           = s?.LastValidatedAt,
            LastValidationStatus      = s?.LastValidationStatus ?? PaymentProviderValidationStatus.NotValidated,
            LastValidationMessageCode = s?.LastValidationMessageCode,

            // Readiness signals (all safe/non-secret).
            IsConfigured                   = s is not null,
            CanCreateCheckoutSession       = readiness.CanCreate,
            LiveModeBlocked                = true,
            EncryptionPassphraseConfigured = EncryptionPassphraseConfigured,
            WebhookEndpointPath            = StripeWebhookPath,
            WebhookEndpointUrl             = ResolveWebhookEndpointUrl(),
            SecretsRuntimeSource           = "DatabaseEncrypted",
            ConfigRuntimeSource            = "ServerAppSettings",
            MissingPrerequisites           = readiness.Missing,
            ReadinessCode                  = readiness.Code,
        };

        return dto;
    }
}
