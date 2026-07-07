using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.Payments;

/// <summary>
/// Runtime resolver for the persisted Stripe Test-mode configuration (Jira 9902). This is the single source
/// of truth for Stripe secret material at runtime — the real <c>StripeOnlinePaymentProvider</c> reads its
/// secret key and webhook signing secret through here instead of from environment/appsettings config.
///
/// All paths fail closed: checkout resolution throws a business exception when settings are missing,
/// disabled, malformed, or undecryptable; webhook resolution returns <c>null</c> (so the caller ignores the
/// event with no side effect and no retry storm). Decrypted secrets are returned only for immediate use and
/// are never logged, cached long-term, or surfaced to any DTO.
/// </summary>
public interface IStripePaymentSettingsResolver
{
    /// <summary>
    /// Resolves the decrypted Stripe secret key for creating/expiring a checkout session. Throws an ABP
    /// <see cref="Volo.Abp.BusinessException"/> (fail-closed) when no enabled, valid, decryptable Test-mode
    /// configuration exists.
    /// </summary>
    Task<string> ResolveSecretKeyForCheckoutAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Resolves the decrypted Stripe webhook signing secret for signature verification, or <c>null</c> when
    /// it cannot be resolved (missing/disabled/undecryptable). The webhook caller treats <c>null</c> as
    /// "cannot verify" and ignores the event without mutating any payment state.
    /// </summary>
    Task<string?> TryResolveWebhookSecretAsync(CancellationToken cancellationToken = default);
}
