using System;
using System.Collections.Generic;
using System.Net;
using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// Startup-time environment fail-safes for online payment configuration (Jira 9802).
/// Pure static rules over already-read config/environment values so the policy is unit-testable
/// without a host and cannot drift from the registration code that calls it.
/// </summary>
public static class OnlinePaymentStartupGuard
{
    /// <summary>
    /// Mock providers parse UNSIGNED webhook payloads (no provider signature check), so they are
    /// strictly Development-only. Fails startup (fail-closed) when online payments are enabled
    /// together with mock providers outside Development. Callers must treat an unknown or
    /// unresolvable environment as non-Development so misconfiguration can never fail open.
    /// </summary>
    public static void EnsureMockProvidersAreDevelopmentOnly(
        bool paymentsEnabled, bool useMockProviders, bool isDevelopment)
    {
        if (paymentsEnabled && useMockProviders && !isDevelopment)
        {
            throw new AbpInitializationException(
                "Unsafe OnlinePayments configuration for this environment: " +
                "'OnlinePayments:Enabled' and 'OnlinePayments:UseMockProviders' are both true outside " +
                "the Development environment. Mock payment providers accept unsigned webhook payloads " +
                "and must never be reachable by real traffic. Either set " +
                "'OnlinePayments:UseMockProviders' to false and configure a real provider, or set " +
                "'OnlinePayments:Enabled' to false for this environment.");
        }
    }

    /// <summary>
    /// Mock providers are registered only when explicitly enabled AND running in Development.
    /// Outside Development a UseMockProviders=true configuration registers no providers at all
    /// (payments are necessarily disabled there — see
    /// <see cref="EnsureMockProvidersAreDevelopmentOnly"/>), so unsigned mock webhook payloads can
    /// never be parsed.
    /// </summary>
    public static bool ShouldRegisterMockProviders(bool useMockProviders, bool isDevelopment)
        => useMockProviders && isDevelopment;

    /// <summary>
    /// When online payments are enabled with the real Stripe provider, both secrets must be present
    /// at startup — a missing key must fail fast rather than on the first checkout or webhook.
    /// The exception message names the missing configuration keys but never echoes any value.
    /// </summary>
    public static void EnsureStripeSecretsPresent(
        bool paymentsEnabled, string? secretKey, string? webhookSecret)
    {
        if (!paymentsEnabled)
        {
            return;
        }

        var missing = new List<string>(2);
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            missing.Add("OnlinePayments:Providers:Stripe:SecretKey");
        }

        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            missing.Add("OnlinePayments:Providers:Stripe:WebhookSecret");
        }

        if (missing.Count == 0)
        {
            return;
        }

        throw new AbpInitializationException(
            "Online payments are enabled with the real Stripe provider, but required configuration " +
            $"value(s) are missing: {string.Join(", ", missing)}. Provide them via environment " +
            "variables or user-secrets (e.g. dotnet user-secrets set " +
            "\"OnlinePayments:Providers:Stripe:SecretKey\" \"...\") - never in committed appsettings files.");
    }

    /// <summary>
    /// Validates the browser return URLs (Jira 9811). When payments are enabled both must be present and
    /// absolute; outside Development each must be HTTPS on a non-local, non-private host, and neither may
    /// carry its own query/fragment (the server appends the safe <c>?orderId=&amp;orderNumber=&amp;provider=</c>
    /// params itself — a pre-existing query would both corrupt that and widen the redirect surface).
    /// Fails startup (fail-closed) so a real customer can never be bounced to an untrusted/loopback origin
    /// after checkout. Values are URLs, not secrets, so the message may name the offending host/scheme.
    /// </summary>
    public static void EnsureReturnUrlsAreValid(
        bool paymentsEnabled, bool isDevelopment, string? successReturnBaseUrl, string? cancelReturnBaseUrl)
    {
        if (!paymentsEnabled)
        {
            return;
        }

        ValidateReturnUrl("OnlinePayments:SuccessReturnBaseUrl", successReturnBaseUrl, isDevelopment);
        ValidateReturnUrl("OnlinePayments:CancelReturnBaseUrl",  cancelReturnBaseUrl,  isDevelopment);
    }

    private static void ValidateReturnUrl(string key, string? value, bool isDevelopment)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new AbpInitializationException(
                $"Online payments are enabled but '{key}' is not configured. Set it to the absolute " +
                "browser return URL (e.g. https://<domain>/checkout/success).");
        }

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri))
        {
            throw new AbpInitializationException(
                $"'{key}' must be an absolute URL (e.g. https://<domain>/checkout/success).");
        }

        if (!string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
        {
            throw new AbpInitializationException(
                $"'{key}' must not contain a query string or fragment; the server appends the return " +
                "parameters itself.");
        }

        if (isDevelopment)
        {
            // Development may use http://localhost:3000/checkout/... .
            return;
        }

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            throw new AbpInitializationException(
                $"'{key}' must use HTTPS outside Development. Configured scheme: '{uri.Scheme}'.");
        }

        if (IsLocalOrPrivateHost(uri))
        {
            throw new AbpInitializationException(
                $"'{key}' must not point to localhost or a private/loopback address outside Development. " +
                $"Configured host: '{uri.Host}'.");
        }
    }

    private static bool IsLocalOrPrivateHost(Uri uri)
    {
        if (uri.IsLoopback || string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (IPAddress.TryParse(uri.Host, out var ip))
        {
            if (IPAddress.IsLoopback(ip))
            {
                return true;
            }

            var b = ip.GetAddressBytes();
            if (b.Length == 4)
            {
                // RFC1918 private + RFC3927 link-local ranges.
                if (b[0] == 10) return true;
                if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return true;
                if (b[0] == 192 && b[1] == 168) return true;
                if (b[0] == 169 && b[1] == 254) return true;
            }
        }

        return false;
    }
}
