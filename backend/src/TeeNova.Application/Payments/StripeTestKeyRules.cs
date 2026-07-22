using System;

namespace TeeNova.Payments;

/// <summary>
/// Central, single-source Stripe key rules — shared by the write-side validation (admin save) and the
/// runtime resolver (defense-in-depth re-check after decryption) so the two can never drift.
///
/// Jira 9902 established Test-mode-only rules; Jira 9908 makes the rules MODE-AWARE so a guarded Live mode
/// can be configured without ever letting a key land in the wrong mode:
///   • Test mode accepts only sk_test_ / pk_test_ (+ whsec_); a live-prefixed key is rejected.
///   • Live mode accepts only sk_live_ / pk_live_ (+ whsec_); a test-prefixed key is rejected.
///   • Restricted keys (rk_live_ / rk_test_) are rejected in EVERY mode.
/// whsec_ is the webhook signing-secret prefix for both test and live endpoints, so it is mode-neutral.
///
/// Nothing here enables Live mode — the server-side unlock flag
/// (<c>OnlinePayments:AllowLiveModeConfiguration</c>) and the active-mode selection are enforced by the app
/// service and runtime resolver. These rules only decide whether a supplied key is well-formed for a mode.
/// </summary>
public static class StripeTestKeyRules
{
    public const string SecretKeyTestPrefix      = "sk_test_";
    public const string SecretKeyLivePrefix      = "sk_live_";
    public const string PublishableKeyTestPrefix = "pk_test_";
    public const string PublishableKeyLivePrefix = "pk_live_";
    public const string WebhookSecretPrefix      = "whsec_";

    // Restricted (rk_*) keys are never accepted in any mode — TeeNova only ever needs a standard secret key.
    public static readonly string[] ForbiddenRestrictedPrefixes = { "rk_live_", "rk_test_" };

    /// <summary>The expected secret-key prefix for a mode (sk_test_ for Test, sk_live_ for Live).</summary>
    public static string SecretKeyPrefix(PaymentProviderMode mode) =>
        mode == PaymentProviderMode.Live ? SecretKeyLivePrefix : SecretKeyTestPrefix;

    /// <summary>The expected publishable-key prefix for a mode (pk_test_ for Test, pk_live_ for Live).</summary>
    public static string PublishableKeyPrefix(PaymentProviderMode mode) =>
        mode == PaymentProviderMode.Live ? PublishableKeyLivePrefix : PublishableKeyTestPrefix;

    /// <summary>True when the value is a well-formed Stripe secret key for the given mode, no whitespace.</summary>
    public static bool IsValidSecretKey(string? value, PaymentProviderMode mode) =>
        HasCleanPrefix(value, SecretKeyPrefix(mode));

    /// <summary>True when the value is a well-formed Stripe publishable key for the given mode, no whitespace.</summary>
    public static bool IsValidPublishableKey(string? value, PaymentProviderMode mode) =>
        HasCleanPrefix(value, PublishableKeyPrefix(mode));

    /// <summary>True when the value is a well-formed Stripe webhook signing secret (whsec_...), no whitespace.</summary>
    public static bool IsValidWebhookSecret(string? value) =>
        HasCleanPrefix(value, WebhookSecretPrefix);

    /// <summary>True when the value uses a restricted (rk_*) prefix — never accepted in any mode.</summary>
    public static bool IsRestrictedKey(string? value)
        => StartsWithAny(value, ForbiddenRestrictedPrefixes);

    /// <summary>
    /// True when the value carries a Stripe key prefix that belongs to the OTHER mode (e.g. an sk_live_/pk_live_
    /// supplied while configuring Test, or an sk_test_/pk_test_ supplied while configuring Live). Restricted
    /// keys are handled separately by <see cref="IsRestrictedKey"/>.
    /// </summary>
    public static bool IsWrongModeKey(string? value, PaymentProviderMode mode)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var otherMode = mode == PaymentProviderMode.Live ? PaymentProviderMode.Test : PaymentProviderMode.Live;
        var trimmed   = value.Trim();

        return trimmed.StartsWith(SecretKeyPrefix(otherMode), StringComparison.Ordinal)
            || trimmed.StartsWith(PublishableKeyPrefix(otherMode), StringComparison.Ordinal);
    }

    /// <summary>Non-secret last-4 fragment for masked display; returns "••••" when too short.</summary>
    public static string Last4(string value)
        => string.IsNullOrEmpty(value) || value.Length < 4 ? "••••" : value[^4..];

    private static bool StartsWithAny(string? value, string[] prefixes)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        foreach (var prefix in prefixes)
        {
            if (trimmed.StartsWith(prefix, StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    private static bool HasCleanPrefix(string? value, string prefix)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        // The raw value must contain no leading/trailing/interior whitespace and carry the exact prefix.
        if (value != value.Trim())
            return false;

        foreach (var ch in value)
        {
            if (char.IsWhiteSpace(ch))
                return false;
        }

        return value.StartsWith(prefix, StringComparison.Ordinal) && value.Length > prefix.Length;
    }
}
