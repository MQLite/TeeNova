using System.Collections.Generic;

namespace TeeNova.Payments;

/// <summary>
/// Top-level online payment configuration, bound from the "OnlinePayments" appsettings section.
/// </summary>
public class OnlinePaymentOptions
{
    public bool            Enabled                { get; set; }
    public PaymentProvider DefaultProvider        { get; set; } = PaymentProvider.Stripe;
    public string          Currency               { get; set; } = "NZD";
    public string          SuccessReturnBaseUrl   { get; set; } = string.Empty;
    public string          CancelReturnBaseUrl    { get; set; } = string.Empty;

    /// <summary>
    /// When true, mock provider implementations are registered so the payment flow can be
    /// exercised locally without real provider credentials. Must be false in production.
    /// </summary>
    public bool UseMockProviders { get; set; }

    /// <summary>
    /// Server-side unlock for Live-mode CONFIGURATION (Jira 9908). Default false/absent.
    /// While false, the admin API rejects every Live-mode write and the UI shows Live mode as locked;
    /// live-prefixed keys (sk_live_/pk_live_) remain rejected. Setting it true only allows an Admin to
    /// SAVE persisted Live-mode settings — it does NOT by itself route public checkout to Live (see
    /// <see cref="ActiveMode"/>). Keep this out of committed appsettings; set it via env/user-secrets only
    /// after the 9907 live-payment enablement checklist is approved.
    /// </summary>
    public bool AllowLiveModeConfiguration { get; set; }

    /// <summary>
    /// Which persisted provider mode public checkout and webhook verification resolve at runtime
    /// (Jira 9908): "Test" (default) or "Live". This is deliberately SEPARATE from
    /// <see cref="AllowLiveModeConfiguration"/> so that saving live keys never silently makes checkout live.
    /// "Live" is honoured only when <see cref="AllowLiveModeConfiguration"/> is also true AND a valid,
    /// enabled Live row exists; any other value or state falls back to Test (fail-closed).
    /// </summary>
    public string ActiveMode { get; set; } = "Test";

    /// <summary>
    /// Per-provider configuration keyed by provider name string ("Stripe", "Windcave", "Poli", "PayPal").
    /// String keys are used so that .NET configuration binding from JSON/environment works correctly.
    /// </summary>
    public Dictionary<string, OnlinePaymentProviderOptions> Providers { get; set; } = new();
}

/// <summary>
/// Per-provider settings. SecretKey and WebhookSecret must only be read server-side and must
/// never be surfaced to the frontend or included in API responses.
/// </summary>
public class OnlinePaymentProviderOptions
{
    public bool   Enabled       { get; set; }
    public string PublicKey     { get; set; } = string.Empty;
    public string SecretKey     { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;

    /// <summary>
    /// Provider-specific overrides that don't fit the standard fields (e.g. account id, region).
    /// Keys and usage are defined by each provider implementation.
    /// </summary>
    public Dictionary<string, string> Extra { get; set; } = new();
}
