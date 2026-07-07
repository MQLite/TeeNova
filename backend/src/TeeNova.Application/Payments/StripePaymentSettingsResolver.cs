using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Security.Encryption;

namespace TeeNova.Payments;

/// <summary>
/// Loads the single persisted Stripe Test-mode configuration and decrypts its secrets on demand (Jira 9902).
/// Every path fails closed and never logs secret material — logs carry only configured/missing/invalid state.
/// </summary>
public class StripePaymentSettingsResolver : IStripePaymentSettingsResolver, ITransientDependency
{
    private readonly IRepository<PaymentProviderSetting, Guid> _repository;
    private readonly IStringEncryptionService                  _encryption;
    private readonly ILogger<StripePaymentSettingsResolver>    _logger;

    public StripePaymentSettingsResolver(
        IRepository<PaymentProviderSetting, Guid> repository,
        IStringEncryptionService                  encryption,
        ILogger<StripePaymentSettingsResolver>    logger)
    {
        _repository = repository;
        _encryption = encryption;
        _logger     = logger;
    }

    public async Task<string> ResolveSecretKeyForCheckoutAsync(CancellationToken cancellationToken = default)
    {
        var setting = await FindActiveAsync(cancellationToken);

        if (setting is null)
        {
            _logger.LogWarning(
                "[Stripe] Checkout blocked: no persisted, enabled Stripe Test-mode configuration exists.");
            throw new BusinessException("TeeNova:Payment:StripeSettingsNotConfigured");
        }

        if (!setting.HasSecretKey)
        {
            _logger.LogWarning(
                "[Stripe] Checkout blocked: persisted Stripe configuration has no secret key configured.");
            throw new BusinessException("TeeNova:Payment:StripeSecretUnavailable");
        }

        var secretKey = TryDecrypt(setting.SecretKeyCipherText, "secret key");

        // Defense-in-depth: a decrypted value that is not a clean test secret key (tampering, wrong
        // encryption key, or a live key that slipped past write validation) fails closed.
        if (secretKey is null || !StripeTestKeyRules.IsValidTestSecretKey(secretKey))
        {
            _logger.LogWarning(
                "[Stripe] Checkout blocked: persisted secret key is undecryptable or not a valid sk_test_ key.");
            throw new BusinessException("TeeNova:Payment:StripeSecretUnavailable");
        }

        return secretKey;
    }

    public async Task<string?> TryResolveWebhookSecretAsync(CancellationToken cancellationToken = default)
    {
        var setting = await FindActiveAsync(cancellationToken);

        if (setting is null || !setting.HasWebhookSecret)
        {
            _logger.LogWarning(
                "[Stripe] Webhook secret unavailable: no enabled Stripe Test-mode configuration with a webhook secret.");
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

    /// <summary>Returns the enabled Stripe/Test row, or null when none exists / it is disabled.</summary>
    private async Task<PaymentProviderSetting?> FindActiveAsync(CancellationToken cancellationToken)
    {
        var query = await _repository.GetQueryableAsync();
        var setting = await query
            .Where(s => s.Provider == PaymentProvider.Stripe && s.Mode == PaymentProviderMode.Test)
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
