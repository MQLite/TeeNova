using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Security.Encryption;

namespace TeeNova.Payments;

/// <summary>
/// Loads the persisted Stripe configuration for the ACTIVE runtime mode and decrypts its secrets on demand
/// (Jira 9902; mode-aware in Jira 9908).
///
/// The active mode is Test by default. It is Live only when BOTH the server-side unlock flag
/// (<c>OnlinePayments:AllowLiveModeConfiguration</c>) is set AND <c>OnlinePayments:ActiveMode</c> is exactly
/// "Live" — so live checkout can never activate merely because a live row exists. After decryption the secret
/// is re-checked against the active mode's expected prefix (defense in depth). Every path fails closed and
/// never logs secret material — logs carry only configured/missing/invalid state and the active mode.
/// </summary>
public class StripePaymentSettingsResolver : IStripePaymentSettingsResolver, ITransientDependency
{
    private readonly IRepository<PaymentProviderSetting, Guid> _repository;
    private readonly IStringEncryptionService                  _encryption;
    private readonly IConfiguration                            _configuration;
    private readonly ILogger<StripePaymentSettingsResolver>    _logger;

    public StripePaymentSettingsResolver(
        IRepository<PaymentProviderSetting, Guid> repository,
        IStringEncryptionService                  encryption,
        IConfiguration                            configuration,
        ILogger<StripePaymentSettingsResolver>    logger)
    {
        _repository    = repository;
        _encryption    = encryption;
        _configuration = configuration;
        _logger        = logger;
    }

    public async Task<string> ResolveSecretKeyForCheckoutAsync(CancellationToken cancellationToken = default)
    {
        var activeMode = ResolveActiveMode();
        var setting    = await FindActiveAsync(activeMode, cancellationToken);

        if (setting is null)
        {
            _logger.LogWarning(
                "[Stripe] Checkout blocked: no persisted, enabled Stripe {Mode}-mode configuration exists.", activeMode);
            throw new BusinessException("TeeNova:Payment:StripeSettingsNotConfigured");
        }

        if (!setting.HasSecretKey)
        {
            _logger.LogWarning(
                "[Stripe] Checkout blocked: persisted Stripe {Mode} configuration has no secret key configured.", activeMode);
            throw new BusinessException("TeeNova:Payment:StripeSecretUnavailable");
        }

        var secretKey = TryDecrypt(setting.SecretKeyCipherText, "secret key");

        // Defense-in-depth: a decrypted value that is not a clean secret key for the active mode (tampering,
        // wrong encryption key, or a key that slipped past write validation) fails closed.
        if (secretKey is null || !StripeTestKeyRules.IsValidSecretKey(secretKey, activeMode))
        {
            _logger.LogWarning(
                "[Stripe] Checkout blocked: persisted secret key is undecryptable or not a valid {Prefix} key.",
                StripeTestKeyRules.SecretKeyPrefix(activeMode));
            throw new BusinessException("TeeNova:Payment:StripeSecretUnavailable");
        }

        return secretKey;
    }

    public async Task<string?> TryResolveWebhookSecretAsync(CancellationToken cancellationToken = default)
    {
        var activeMode = ResolveActiveMode();
        var setting    = await FindActiveAsync(activeMode, cancellationToken);

        if (setting is null || !setting.HasWebhookSecret)
        {
            _logger.LogWarning(
                "[Stripe] Webhook secret unavailable: no enabled Stripe {Mode}-mode configuration with a webhook secret.", activeMode);
            return null;
        }

        var webhookSecret = TryDecrypt(setting.WebhookSecretCipherText, "webhook secret");

        if (webhookSecret is null || !StripeTestKeyRules.IsValidWebhookSecret(webhookSecret))
        {
            _logger.LogWarning(
                "[Stripe] Webhook secret unavailable: persisted value is undecryptable or not a valid whsec_ secret.");
            return null;
        }

        return webhookSecret;
    }

    /// <summary>
    /// The runtime active mode. Live is honoured only when the unlock flag is set AND the configured active
    /// mode is exactly "Live"; anything else falls back to Test (fail-closed). Mirrors the app service.
    /// </summary>
    private PaymentProviderMode ResolveActiveMode()
    {
        if (!_configuration.GetValue<bool>("OnlinePayments:AllowLiveModeConfiguration"))
            return PaymentProviderMode.Test;

        var configured = _configuration["OnlinePayments:ActiveMode"];
        return string.Equals((configured ?? string.Empty).Trim(), "Live", StringComparison.OrdinalIgnoreCase)
            ? PaymentProviderMode.Live
            : PaymentProviderMode.Test;
    }

    /// <summary>Returns the enabled Stripe row for the active mode, or null when none exists / it is disabled.</summary>
    private async Task<PaymentProviderSetting?> FindActiveAsync(PaymentProviderMode mode, CancellationToken cancellationToken)
    {
        var query = await _repository.GetQueryableAsync();
        var setting = await query
            .Where(s => s.Provider == PaymentProvider.Stripe && s.Mode == mode)
            .FirstOrDefaultAsync(cancellationToken);

        if (setting is null || !setting.IsEnabled)
            return null;

        return setting;
    }

    /// <summary>Decrypts a ciphertext, swallowing failures into null (fail closed) — never logs the value.</summary>
    private string? TryDecrypt(string? cipherText, string label)
    {
        if (string.IsNullOrWhiteSpace(cipherText))
            return null;

        try
        {
            var plain = _encryption.Decrypt(cipherText);
            return string.IsNullOrWhiteSpace(plain) ? null : plain;
        }
        catch (Exception ex)
        {
            // Wrong/rotated encryption key or corrupt ciphertext. Log the label only — never the ciphertext
            // or the (attempted) plaintext.
            _logger.LogError(ex,
                "[Stripe] Failed to decrypt persisted {Label}. Check that the application encryption key " +
                "(Encryption:PassPhrase) matches the key in effect when the secret was saved.", label);
            return null;
        }
    }
}
