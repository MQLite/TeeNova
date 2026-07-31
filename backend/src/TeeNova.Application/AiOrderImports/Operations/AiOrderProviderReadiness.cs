using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.Recognition;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Operations;

public sealed class AiOrderProviderReadiness : ITransientDependency
{
    private static readonly IReadOnlyDictionary<string, string> ApprovedHosts =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["gemini"] = "generativelanguage.googleapis.com",
            ["openai"] = "api.openai.com",
            ["claude"] = "api.anthropic.com",
        };

    public IReadOnlyList<AiOrderProviderReadinessDto> Evaluate(
        AiOrderRecognitionOptions recognition,
        AiOrderFeatureOptions features,
        string environment)
    {
        return recognition.Providers
            .OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
            .Select(pair => EvaluateProvider(pair.Key, pair.Value, recognition, features, environment))
            .ToArray();
    }

    private static AiOrderProviderReadinessDto EvaluateProvider(
        string providerId,
        AiOrderRecognitionProviderOptions provider,
        AiOrderRecognitionOptions recognition,
        AiOrderFeatureOptions features,
        string environment)
    {
        var enabledModels = provider.Models
            .Where(x => x.Value.Enabled)
            .Select(x => x.Key)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToArray();

        var status = DetermineStatus(
            providerId,
            provider,
            enabledModels,
            recognition,
            features,
            environment);
        return new()
        {
            Provider = providerId,
            DisplayName = provider.DisplayName,
            Status = status,
            PrivacyApprovalStatus = provider.PrivacyApprovalStatus,
            ApprovedEnvironment = provider.ApprovedEnvironment,
            PrivacyApprovalDate = provider.PrivacyApprovalDate,
            ApproverNote = NullIfWhiteSpace(provider.ApproverNote),
            DataUsePolicyReference = NullIfWhiteSpace(provider.DataUsePolicyReference),
            AllowedDocumentClassification = NullIfWhiteSpace(
                provider.AllowedDocumentClassification),
            EnabledModels = enabledModels,
            MaximumDailyCalls = provider.MaximumDailyCalls,
            MaximumMonthlyCostUsd = provider.MaximumMonthlyCostUsd,
            LastSanitizedSmokeTestAt = provider.LastSanitizedSmokeTestAt,
            LastSanitizedSmokeTestSucceeded = provider.LastSanitizedSmokeTestSucceeded,
        };
    }

    private static string DetermineStatus(
        string providerId,
        AiOrderRecognitionProviderOptions provider,
        IReadOnlyCollection<string> enabledModels,
        AiOrderRecognitionOptions recognition,
        AiOrderFeatureOptions features,
        string environment)
    {
        if (!features.Enabled || !features.RecognitionEnabled ||
            !recognition.Enabled || !provider.Enabled)
            return "Disabled";
        if (string.Equals(provider.PrivacyApprovalStatus, "Suspended", StringComparison.Ordinal))
            return "Suspended";
        if (string.IsNullOrWhiteSpace(provider.ApiKey))
            return "Missing Key";
        if (enabledModels.Count == 0)
            return "No Enabled Model";
        if (!Uri.TryCreate(provider.BaseUrl, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !ApprovedHosts.TryGetValue(providerId, out var approvedHost) ||
            !string.Equals(uri.Host, approvedHost, StringComparison.OrdinalIgnoreCase))
            return "Invalid URL";
        if (provider.MaximumDailyCalls < 1 || provider.MaximumMonthlyCostUsd < 0 ||
            enabledModels.Any(modelId =>
            {
                var model = provider.Models[modelId];
                return string.IsNullOrWhiteSpace(model.PricingVersion) ||
                       model.InputUsdPerMillionTokens < 0 ||
                       model.CachedInputUsdPerMillionTokens < 0 ||
                       model.OutputUsdPerMillionTokens < 0;
            }))
            return "Budget Invalid";
        if (enabledModels.Any(modelId =>
            {
                var model = provider.Models[modelId];
                return string.IsNullOrWhiteSpace(model.StructuredOutputMode) ||
                       string.IsNullOrWhiteSpace(model.ApiMode) ||
                       string.IsNullOrWhiteSpace(model.ApiVersion) ||
                       (!model.SupportsImages && !model.SupportsPdf);
            }))
            return "No Structured Output Model";
        if (!PrivacyApproved(provider, environment))
            return "Privacy Approval Missing";
        if (!provider.LastSanitizedSmokeTestSucceeded ||
            !provider.LastSanitizedSmokeTestAt.HasValue)
            return "Provider Test Outstanding";
        return "Ready";
    }

    private static bool PrivacyApproved(
        AiOrderRecognitionProviderOptions provider,
        string environment)
    {
        if (!string.Equals(
                provider.ApprovedEnvironment,
                environment,
                StringComparison.OrdinalIgnoreCase))
            return false;

        if (string.Equals(environment, "Production", StringComparison.OrdinalIgnoreCase))
            return string.Equals(
                       provider.PrivacyApprovalStatus,
                       "ApprovedForProductionCustomerData",
                       StringComparison.Ordinal) &&
                   !string.IsNullOrWhiteSpace(provider.DataUsePolicyReference) &&
                   !string.IsNullOrWhiteSpace(provider.AllowedDocumentClassification) &&
                   provider.PrivacyApprovalDate.HasValue;

        return provider.PrivacyApprovalStatus is
            "ApprovedForSanitizedTesting" or "ApprovedForProductionCustomerData";
    }

    private static string? NullIfWhiteSpace(string value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
