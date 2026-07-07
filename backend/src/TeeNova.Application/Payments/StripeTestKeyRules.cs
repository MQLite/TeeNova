using System;

namespace TeeNova.Payments;

/// <summary>
/// Central, single-source Stripe Test-mode key rules (Jira 9902). Shared by the write-side validation
/// (admin save) and the runtime resolver (defense-in-depth re-check after decryption) so the two can never
/// drift. Live-key prefixes are listed only so they can be explicitly rejected — nothing here enables Live.
/// </summary>
public static class StripeTestKeyRules
{
    public const string SecretKeyTestPrefix      = "sk_test_";
    public const string WebhookSecretPrefix      = "whsec_";
    public const string PublishableKeyTestPrefix = "pk_test_";

    // Rejected outright on save and on resolve.
    public static readonly string[] ForbiddenLivePrefixes = { "sk_live_", "pk_live_", "rk_live_", "rk_test_" };

    /// <summary>True when the value is a well-formed Stripe test secret key (sk_test_...), no whitespace.</summary>
    public static bool IsValidTestSecretKey(string? value) =>
        HasCleanPrefix(value, SecretKeyTestPrefix);

    /// <summary>True when the value is a well-formed Stripe webhook signing secret (whsec_...), no whitespace.</summary>
    public static bool IsValidWebhookSecret(string? value) =>
        HasCleanPrefix(value, WebhookSecretPrefix);

    /// <summary>True when the value is a well-formed Stripe test publishable key (pk_test_...), no whitespace.</summary>
    public static bool IsValidTestPublishableKey(string? value) =>
        HasCleanPrefix(value, PublishableKeyTestPrefix);

    /// <summary>True when the value uses any forbidden live/restricted prefix.</summary>
    public static bool IsForbiddenLiveKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        foreach (var prefix in ForbiddenLivePrefixes)
        {
            if (trimmed.StartsWith(prefix, StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    /// <summary>Non-secret last-4 fragment for masked display; returns "••••" when too short.</summary>
    public static string Last4(string value)
        => string.IsNullOrEmpty(value) || value.Length < 4 ? "••••" : value[^4..];

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
