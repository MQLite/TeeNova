using Microsoft.Extensions.Options;

namespace TeeNova.AiOrderImports.Recognition;

public sealed class AiOrderRecognitionOptions
{
    public const string SectionName = "AiOrderRecognition";

    public bool Enabled { get; set; }
    public int WorkerPeriodSeconds { get; set; } = 3;
    public int LeaseMinutes { get; set; } = 5;
    public int RequestTimeoutSeconds { get; set; } = 90;
    public int MaximumAttemptsPerImport { get; set; } = 4;
    public int MaximumSources { get; set; } = 12;
    public long MaximumSourceBytes { get; set; } = 64 * 1024 * 1024;
    public int MaximumOutputCharacters { get; set; } = 1_000_000;
    public int RetryBaseSeconds { get; set; } = 2;
    public int RetryMaximumSeconds { get; set; } = 120;
    public int RawResultRetentionDays { get; set; } = 30;
    public bool RetainRawProviderEvidence { get; set; } = true;
    public decimal MaximumEstimatedCostUsdPerAttempt { get; set; } = 1m;
    public decimal MaximumEstimatedCostUsdPerMonth { get; set; } = 100m;
    public string CurrencyContext { get; set; } = "NZD";
    public string LocaleContext { get; set; } = "en-NZ";
    public Dictionary<string, AiOrderRecognitionProviderOptions> Providers { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}

public sealed class AiOrderRecognitionProviderOptions
{
    public bool Enabled { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public Dictionary<string, AiOrderRecognitionModelOptions> Models { get; set; } =
        new(StringComparer.Ordinal);
}

public sealed class AiOrderRecognitionModelOptions
{
    public bool Enabled { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string ApiMode { get; set; } = string.Empty;
    public string ApiVersion { get; set; } = string.Empty;
    public string StructuredOutputMode { get; set; } = string.Empty;
    public bool SupportsImages { get; set; }
    public bool SupportsPdf { get; set; }
    public string PricingVersion { get; set; } = string.Empty;
    public decimal InputUsdPerMillionTokens { get; set; }
    public decimal CachedInputUsdPerMillionTokens { get; set; }
    public decimal OutputUsdPerMillionTokens { get; set; }
    public long EstimatedInputTokensPerMegabyte { get; set; } = 300_000;
    public long EstimatedOutputTokens { get; set; } = 8_000;
}

public sealed class AiOrderRecognitionOptionsValidator :
    IValidateOptions<AiOrderRecognitionOptions>
{
    private static readonly HashSet<string> KnownProviders =
        new(["gemini", "openai", "claude"], StringComparer.OrdinalIgnoreCase);

    public ValidateOptionsResult Validate(string? name, AiOrderRecognitionOptions options)
    {
        if (options.WorkerPeriodSeconds is < 1 or > 60 ||
            options.LeaseMinutes is < 1 or > 30 ||
            options.RequestTimeoutSeconds is < 5 or > 300 ||
            options.MaximumAttemptsPerImport is < 1 or > 10 ||
            options.MaximumSources is < 1 or > 50 ||
            options.MaximumSourceBytes <= 0 ||
            options.MaximumOutputCharacters is < 1_000 or > 5_000_000 ||
            options.RetryBaseSeconds < 1 ||
            options.RetryMaximumSeconds < options.RetryBaseSeconds ||
            options.RawResultRetentionDays is < 0 or > 365 ||
            options.MaximumEstimatedCostUsdPerAttempt < 0 ||
            options.MaximumEstimatedCostUsdPerMonth < 0)
        {
            return ValidateOptionsResult.Fail(
                "AiOrderRecognition contains an invalid bound or budget.");
        }

        foreach (var (providerId, provider) in options.Providers)
        {
            if (!KnownProviders.Contains(providerId))
                return ValidateOptionsResult.Fail($"Unknown recognition provider '{providerId}'.");
            if (provider.Enabled && string.IsNullOrWhiteSpace(provider.ApiKey))
                return ValidateOptionsResult.Fail(
                    $"Enabled provider '{providerId}' requires a server-side API key.");
            if (provider.Enabled &&
                (!Uri.TryCreate(provider.BaseUrl, UriKind.Absolute, out var uri) ||
                 uri.Scheme != Uri.UriSchemeHttps))
            {
                return ValidateOptionsResult.Fail(
                    $"Enabled provider '{providerId}' requires an HTTPS BaseUrl.");
            }

            foreach (var (modelId, model) in provider.Models)
            {
                if (string.IsNullOrWhiteSpace(modelId) ||
                    string.IsNullOrWhiteSpace(model.ApiMode) ||
                    string.IsNullOrWhiteSpace(model.ApiVersion) ||
                    string.IsNullOrWhiteSpace(model.StructuredOutputMode) ||
                    string.IsNullOrWhiteSpace(model.PricingVersion) ||
                    model.InputUsdPerMillionTokens < 0 ||
                    model.CachedInputUsdPerMillionTokens < 0 ||
                    model.OutputUsdPerMillionTokens < 0 ||
                    model.EstimatedInputTokensPerMegabyte <= 0 ||
                    model.EstimatedOutputTokens <= 0)
                {
                    return ValidateOptionsResult.Fail(
                        $"Recognition model '{providerId}/{modelId}' is incomplete.");
                }
            }
        }

        return ValidateOptionsResult.Success;
    }
}
