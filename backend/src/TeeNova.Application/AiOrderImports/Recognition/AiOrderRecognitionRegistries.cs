using Microsoft.Extensions.Options;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Recognition;

public sealed class AiOrderRecognitionProviderRegistry :
    IAiOrderRecognitionProviderRegistry,
    ITransientDependency
{
    private readonly IReadOnlyDictionary<string, IAiOrderRecognitionProvider> _providers;

    public AiOrderRecognitionProviderRegistry(IEnumerable<IAiOrderRecognitionProvider> providers)
    {
        _providers = providers.ToDictionary(x => x.ProviderId, StringComparer.OrdinalIgnoreCase);
    }

    public IAiOrderRecognitionProvider Resolve(string providerId) =>
        _providers.TryGetValue(providerId, out var provider)
            ? provider
            : throw new BusinessException(AiOrderImportErrorCodes.RecognitionOptionNotEnabled);
}

public sealed class AiOrderRecognitionModelRegistry :
    IAiOrderRecognitionModelRegistry,
    ITransientDependency
{
    private readonly AiOrderRecognitionOptions _options;

    public AiOrderRecognitionModelRegistry(IOptions<AiOrderRecognitionOptions> options)
    {
        _options = options.Value;
    }

    public IReadOnlyList<AiOrderRecognitionProviderOption> GetEnabledOptions()
    {
        if (!_options.Enabled)
            return [];

        return _options.Providers
            .Where(x => IsEnabled(x.Value))
            .OrderBy(x => x.Value.DisplayName, StringComparer.Ordinal)
            .Select(x => new AiOrderRecognitionProviderOption(
                x.Key,
                x.Value.DisplayName,
                x.Value.Models
                    .Where(model => model.Value.Enabled)
                    .OrderBy(model => model.Value.DisplayName, StringComparer.Ordinal)
                    .Select(model => new AiOrderRecognitionModelOption(
                        model.Key,
                        model.Value.DisplayName,
                        model.Value.SupportsImages,
                        model.Value.SupportsPdf))
                    .ToArray()))
            .Where(x => x.Models.Count > 0)
            .ToArray();
    }

    public AiOrderRecognitionModelSelection ResolveEnabled(string providerId, string modelId)
    {
        if (!_options.Enabled ||
            !_options.Providers.TryGetValue(providerId, out var provider) ||
            !IsEnabled(provider) ||
            !provider.Models.TryGetValue(modelId, out var model) ||
            !model.Enabled)
        {
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionOptionNotEnabled);
        }

        return new AiOrderRecognitionModelSelection(
            providerId,
            provider.DisplayName,
            modelId,
            model.DisplayName,
            model.ApiMode,
            model.ApiVersion,
            model.StructuredOutputMode,
            model.SupportsImages,
            model.SupportsPdf,
            model.PricingVersion,
            model.InputUsdPerMillionTokens,
            model.CachedInputUsdPerMillionTokens,
            model.OutputUsdPerMillionTokens,
            model.EstimatedInputTokensPerMegabyte,
            model.EstimatedOutputTokens);
    }

    private static bool IsEnabled(AiOrderRecognitionProviderOptions provider) =>
        provider.Enabled && !string.IsNullOrWhiteSpace(provider.ApiKey);
}

public sealed class AiOrderRecognitionCostEstimator :
    IAiOrderRecognitionCostEstimator,
    ITransientDependency
{
    public AiOrderRecognitionCostEstimate Estimate(
        AiOrderRecognitionModelSelection selection,
        IReadOnlyCollection<AiOrderRecognitionSourceDescriptor> sources)
    {
        var bytes = sources.Sum(x => x.ByteSize);
        var estimatedInput = Math.Max(
            1,
            (long)Math.Ceiling(
                bytes / (1024m * 1024m) * selection.EstimatedInputTokensPerMegabyte));
        var inputCost = estimatedInput / 1_000_000m * selection.InputUsdPerMillionTokens;
        var outputCost =
            selection.EstimatedOutputTokens / 1_000_000m * selection.OutputUsdPerMillionTokens;
        return new AiOrderRecognitionCostEstimate(
            estimatedInput,
            selection.EstimatedOutputTokens,
            decimal.Round(inputCost + outputCost, 6, MidpointRounding.AwayFromZero));
    }

    public decimal CalculateActual(
        AiOrderRecognitionModelSelection selection,
        AiOrderRecognitionUsage usage)
    {
        var uncached = Math.Max(0, (usage.InputTokens ?? 0) - (usage.CachedInputTokens ?? 0));
        var cost =
            uncached / 1_000_000m * selection.InputUsdPerMillionTokens +
            (usage.CachedInputTokens ?? 0) / 1_000_000m *
            selection.CachedInputUsdPerMillionTokens +
            (usage.OutputTokens ?? 0) / 1_000_000m * selection.OutputUsdPerMillionTokens;
        return decimal.Round(cost, 6, MidpointRounding.AwayFromZero);
    }
}
