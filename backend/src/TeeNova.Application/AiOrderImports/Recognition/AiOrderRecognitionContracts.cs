using System.Net;

namespace TeeNova.AiOrderImports.Recognition;

public static class AiOrderRecognitionVersions
{
    public const string Contract = "1.0";
    public const string Prompt = "ai-order-extraction-prompt-v1";
    public const string StructuralValidation = "ai-order-structural-v1";
}

public sealed record AiOrderRecognitionSource(
    Guid SourceDocumentId,
    int Sequence,
    string SafeLabel,
    string ContentType,
    byte[] Content,
    string Sha256,
    int RotationDegrees);

public sealed record AiOrderRecognitionRequest(
    Guid ImportId,
    Guid AttemptId,
    string Provider,
    string Model,
    string PromptVersion,
    string ContractVersion,
    string CurrencyContext,
    string LocaleContext,
    string Prompt,
    string JsonSchema,
    IReadOnlyList<AiOrderRecognitionSource> OrderedSourceDocuments);

public sealed record AiOrderRecognitionUsage(
    long? InputTokens,
    long? OutputTokens,
    long? CachedInputTokens);

public sealed record AiOrderRecognitionResult(
    string StructuredOutputJson,
    byte[] RawResponse,
    string? ProviderRequestId,
    string? FinishReason,
    AiOrderRecognitionUsage Usage);

public interface IAiOrderRecognitionProvider
{
    string ProviderId { get; }

    Task<AiOrderRecognitionResult> RecognizeAsync(
        AiOrderRecognitionRequest request,
        CancellationToken cancellationToken);
}

public sealed class AiOrderRecognitionProviderException : Exception
{
    public string SafeCode { get; }
    public HttpStatusCode? StatusCode { get; }
    public TimeSpan? RetryAfter { get; }
    public string? ProviderRequestId { get; }
    public bool IsRetryable { get; }

    public AiOrderRecognitionProviderException(
        string safeCode,
        bool isRetryable,
        HttpStatusCode? statusCode = null,
        TimeSpan? retryAfter = null,
        string? providerRequestId = null,
        Exception? innerException = null)
        : base(safeCode, innerException)
    {
        SafeCode = safeCode;
        IsRetryable = isRetryable;
        StatusCode = statusCode;
        RetryAfter = retryAfter;
        ProviderRequestId = providerRequestId;
    }
}

public sealed record AiOrderStructuralValidationResult(
    string CanonicalJson,
    string CanonicalSha256);

public interface IAiOrderRecognitionPromptBuilder
{
    string Build(string currencyContext, string localeContext);
}

public interface IAiOrderRecognitionStructuralValidator
{
    string JsonSchema { get; }
    AiOrderStructuralValidationResult ValidateAndCanonicalize(string json);
    void ValidateSourceReferences(
        string json,
        IReadOnlyDictionary<Guid, int?> allowedSources);
}

public interface IAiOrderRecognitionProviderRegistry
{
    IAiOrderRecognitionProvider Resolve(string providerId);
}

public interface IAiOrderRecognitionModelRegistry
{
    IReadOnlyList<AiOrderRecognitionProviderOption> GetEnabledOptions();
    AiOrderRecognitionModelSelection ResolveEnabled(string providerId, string modelId);
}

public interface IAiOrderRecognitionCostEstimator
{
    AiOrderRecognitionCostEstimate Estimate(
        AiOrderRecognitionModelSelection selection,
        IReadOnlyCollection<AiOrderRecognitionSourceDescriptor> sources);

    decimal CalculateActual(
        AiOrderRecognitionModelSelection selection,
        AiOrderRecognitionUsage usage);
}

public sealed record AiOrderRecognitionSourceDescriptor(
    Guid Id,
    int Sequence,
    string ContentType,
    long ByteSize,
    string Sha256,
    int RotationDegrees,
    int? PageCount);

public sealed record AiOrderRecognitionCostEstimate(
    long EstimatedInputTokens,
    long EstimatedOutputTokens,
    decimal EstimatedCostUsd);

public sealed record AiOrderRecognitionModelSelection(
    string ProviderId,
    string ProviderDisplayName,
    string ModelId,
    string ModelDisplayName,
    string ApiMode,
    string ApiVersion,
    string StructuredOutputMode,
    bool SupportsImages,
    bool SupportsPdf,
    string PricingVersion,
    decimal InputUsdPerMillionTokens,
    decimal CachedInputUsdPerMillionTokens,
    decimal OutputUsdPerMillionTokens,
    long EstimatedInputTokensPerMegabyte,
    long EstimatedOutputTokens);

public sealed record AiOrderRecognitionProviderOption(
    string Id,
    string DisplayName,
    IReadOnlyList<AiOrderRecognitionModelOption> Models);

public sealed record AiOrderRecognitionModelOption(
    string Id,
    string DisplayName,
    bool SupportsImages,
    bool SupportsPdf);
