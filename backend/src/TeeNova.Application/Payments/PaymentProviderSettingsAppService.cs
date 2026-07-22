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
/// Admin management service for the persisted Stripe configuration (Jira 9902; Live-mode guard added in
/// Jira 9908).
///
/// Secrets are accepted write-only, encrypted with the application <see cref="IStringEncryptionService"/>
/// before persistence, and are NEVER returned, revealed, or logged. Reads project a masked DTO
/// (configured/last-4 only). Authorization is enforced at the HTTP boundary (Admin for writes; Admin + Viewer
/// for masked reads).
///
/// Live-mode writes are DOUBLY guarded: Admin-only at the boundary AND rejected here unless the server-side
/// unlock flag <c>OnlinePayments:AllowLiveModeConfiguration</c> is true and the caller supplies the exact
/// confirmation phrase. Test-mode behaviour is unchanged from 9902/9903.
/// </summary>
public class PaymentProviderSettingsAppService : ApplicationService, IPaymentProviderSettingsAppService
{
    // The Stripe webhook path (PaymentWebhookController route "api/payment-webhooks/{provider}").
    private const string StripeWebhookPath = "/api/payment-webhooks/stripe";

    // Deliberate-intent phrase the Live save endpoint requires (mirrored to the UI via the overview DTO).
    private const string LiveConfirmationPhrase = "ENABLE LIVE MODE";

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
        var setting = await FindAsync(PaymentProviderMode.Test);
        return BuildDto(setting, PaymentProviderMode.Test);
    }

    public async Task<PaymentSettingsOverviewDto> GetOverviewAsync()
    {
        var test = await FindAsync(PaymentProviderMode.Test);
        var live = await FindAsync(PaymentProviderMode.Live);
        var activeMode = ResolveActiveMode();

        return new PaymentSettingsOverviewDto
        {
            Test                          = BuildDto(test, PaymentProviderMode.Test),
            Live                          = BuildDto(live, PaymentProviderMode.Live),
            LiveModeConfigurationUnlocked = LiveConfigurationUnlocked,
            ActiveMode                    = activeMode,
            ActiveModeIsLive              = activeMode == PaymentProviderMode.Live,
            ActiveModeSource              = "ServerConfig",
            LiveConfirmationPhrase        = LiveConfirmationPhrase,
        };
    }

    public Task<PaymentProviderSettingDto> UpdateStripeTestAsync(UpdateStripeTestSettingsDto input)
    {
        Check.NotNull(input, nameof(input));
        return SaveAsync(PaymentProviderMode.Test, new SaveInput(
            input.IsEnabled, input.Currency, input.PublishableKey, input.SecretKey,
            input.WebhookSecret, input.SuccessReturnBaseUrl, input.CancelReturnBaseUrl));
    }

    public Task<PaymentProviderSettingDto> UpdateStripeLiveAsync(UpdateStripeLiveSettingsDto input)
    {
        Check.NotNull(input, nameof(input));

        // Guard 1 — server-side unlock. Without it, Live configuration is inert (mirrors the locked UI).
        if (!LiveConfigurationUnlocked)
            throw new UserFriendlyException(
                "Live mode is locked. Complete the 9907 live-payment enablement checklist and set " +
                "'OnlinePayments:AllowLiveModeConfiguration' to true on the server before configuring live keys.");

        // Guard 2 — deliberate-intent confirmation phrase.
        if (!string.Equals((input.ConfirmationPhrase ?? string.Empty).Trim(), LiveConfirmationPhrase, StringComparison.Ordinal))
            throw new UserFriendlyException(
                $"Live mode changes require the exact confirmation phrase \"{LiveConfirmationPhrase}\".");

        return SaveAsync(PaymentProviderMode.Live, new SaveInput(
            input.IsEnabled, input.Currency, input.PublishableKey, input.SecretKey,
            input.WebhookSecret, input.SuccessReturnBaseUrl, input.CancelReturnBaseUrl));
    }

    public Task<PaymentProviderSettingDto> DisableStripeTestAsync() => DisableAsync(PaymentProviderMode.Test);

    public Task<PaymentProviderSettingDto> DisableStripeLiveAsync() => DisableAsync(PaymentProviderMode.Live);

    public async Task<StripeTestSettingsValidationResultDto> ValidateStripeTestAsync()
    {
        var setting  = await FindAsync(PaymentProviderMode.Test);
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
            LiveModeBlocked                = !LiveConfigurationUnlocked,
            MissingPrerequisites           = readiness.Missing,
        };
    }

    // ── Save / disable (mode-aware) ───────────────────────────────────────────────────────────────────

    private readonly record struct SaveInput(
        bool    IsEnabled,
        string? Currency,
        string? PublishableKey,
        string? SecretKey,
        string? WebhookSecret,
        string? SuccessReturnBaseUrl,
        string? CancelReturnBaseUrl);

    private async Task<PaymentProviderSettingDto> SaveAsync(PaymentProviderMode mode, SaveInput input)
    {
        // ── Static validation (no live Stripe API call) ──────────────────────────────────────────────
        var currency = (input.Currency ?? string.Empty).Trim().ToUpperInvariant();
        if (currency != "NZD")
            throw new UserFriendlyException("Currency must be NZD in this phase.");

        // Restricted (rk_*) keys are never accepted, in any mode.
        RejectRestrictedKey(input.SecretKey,     "Secret key");
        RejectRestrictedKey(input.PublishableKey,"Publishable key");
        RejectRestrictedKey(input.WebhookSecret, "Webhook secret");

        // A key carrying the OTHER mode's prefix (e.g. sk_live_ while saving Test, or sk_test_ while saving
        // Live) is rejected with a mode-specific message — a Test key can never land in the Live row and
        // vice-versa.
        RejectWrongModeKey(input.SecretKey,     mode, "Secret key");
        RejectWrongModeKey(input.PublishableKey,mode, "Publishable key");

        var secretKeyProvided     = !string.IsNullOrWhiteSpace(input.SecretKey);
        var webhookSecretProvided = !string.IsNullOrWhiteSpace(input.WebhookSecret);
        var publishableProvided   = !string.IsNullOrWhiteSpace(input.PublishableKey);

        var secretPrefix      = StripeTestKeyRules.SecretKeyPrefix(mode);
        var publishablePrefix = StripeTestKeyRules.PublishableKeyPrefix(mode);

        if (secretKeyProvided && !StripeTestKeyRules.IsValidSecretKey(input.SecretKey, mode))
            throw new UserFriendlyException($"Secret key must be a Stripe {mode} key beginning with '{secretPrefix}' and contain no whitespace.");

        if (webhookSecretProvided && !StripeTestKeyRules.IsValidWebhookSecret(input.WebhookSecret))
            throw new UserFriendlyException("Webhook secret must begin with 'whsec_' and contain no whitespace.");

        if (publishableProvided && !StripeTestKeyRules.IsValidPublishableKey(input.PublishableKey, mode))
            throw new UserFriendlyException($"Publishable key must be a Stripe {mode} key beginning with '{publishablePrefix}'.");

        ValidateReturnUrl(input.SuccessReturnBaseUrl, "/checkout/success", "Success return URL");
        ValidateReturnUrl(input.CancelReturnBaseUrl,  "/checkout/cancel",  "Cancel return URL");

        // ── Load or create the single Stripe row for this mode ────────────────────────────────────────
        var setting = await FindAsync(mode);
        var isNew   = setting is null;
        setting ??= new PaymentProviderSetting(GuidGenerator.Create(), PaymentProvider.Stripe, mode);

        setting.ConfigureStripe(
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
                throw new UserFriendlyException($"Cannot enable Stripe: a {mode.ToString().ToLowerInvariant()} secret key ('{secretPrefix}...') is required.");
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

        // Safe, non-secret audit line: mode, configured/enabled state and last-4 only.
        _logger.LogInformation(
            "[PaymentSettings] Stripe {Mode} settings saved — Enabled: {Enabled}, SecretKey: {SecretState}, " +
            "WebhookSecret: {WebhookState}, Currency: {Currency}.",
            mode,
            setting.IsEnabled,
            setting.HasSecretKey     ? $"configured(••••{setting.SecretKeyLast4})"     : "missing",
            setting.HasWebhookSecret ? $"configured(••••{setting.WebhookSecretLast4})" : "missing",
            setting.Currency);

        return BuildDto(setting, mode);
    }

    private async Task<PaymentProviderSettingDto> DisableAsync(PaymentProviderMode mode)
    {
        var setting = await FindAsync(mode);
        if (setting is null)
            return BuildDto(null, mode);

        // Disable only flips the enabled flag — the encrypted secrets are intentionally retained so the
        // configuration can be re-enabled without re-entering keys. No secret is deleted here.
        setting.Disable();
        await _repository.UpdateAsync(setting, autoSave: true);

        _logger.LogInformation("[PaymentSettings] Stripe {Mode} settings disabled by admin (secrets retained).", mode);
        return BuildDto(setting, mode);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

    private async Task<PaymentProviderSetting?> FindAsync(PaymentProviderMode mode)
    {
        var query = await _repository.GetQueryableAsync();
        return await query
            .Where(s => s.Provider == PaymentProvider.Stripe && s.Mode == mode)
            .FirstOrDefaultAsync();
    }

    /// <summary>Whether the server-side Live-mode configuration unlock flag is set.</summary>
    private bool LiveConfigurationUnlocked
        => _configuration.GetValue<bool>("OnlinePayments:AllowLiveModeConfiguration");

    /// <summary>
    /// The runtime active mode. Live is honoured only when the unlock flag is set AND the configured active
    /// mode is exactly "Live"; anything else falls back to Test (fail-closed). Mirrors the resolver.
    /// </summary>
    private PaymentProviderMode ResolveActiveMode()
    {
        if (!LiveConfigurationUnlocked)
            return PaymentProviderMode.Test;

        var configured = _configuration["OnlinePayments:ActiveMode"];
        return string.Equals((configured ?? string.Empty).Trim(), "Live", StringComparison.OrdinalIgnoreCase)
            ? PaymentProviderMode.Live
            : PaymentProviderMode.Test;
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
        else                                { code = "ReadyForManualSmoke";   status = PaymentProviderValidationStatus.Valid;   }

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

    private static void RejectRestrictedKey(string? value, string label)
    {
        if (StripeTestKeyRules.IsRestrictedKey(value))
            throw new UserFriendlyException(
                $"{label} uses a restricted (rk_) key prefix, which is never accepted — use a standard Stripe secret key.");
    }

    private static void RejectWrongModeKey(string? value, PaymentProviderMode mode, string label)
    {
        if (StripeTestKeyRules.IsWrongModeKey(value, mode))
        {
            var otherMode = mode == PaymentProviderMode.Live ? "test" : "live";
            throw new UserFriendlyException(
                $"{label} is a Stripe {otherMode}-mode key but you are configuring {mode} mode. Use a {mode.ToString().ToLowerInvariant()} key.");
        }
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
    /// the default "not configured" view for the given mode. Contains no secret material or ciphertext — only
    /// configured/last-4 flags and safe readiness codes.
    /// </summary>
    private PaymentProviderSettingDto BuildDto(PaymentProviderSetting? s, PaymentProviderMode mode)
    {
        var readiness = ComputeReadiness(s);

        var dto = new PaymentProviderSettingDto
        {
            Provider                  = PaymentProvider.Stripe,
            Mode                      = mode,
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
            LiveModeBlocked                = !LiveConfigurationUnlocked,
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
