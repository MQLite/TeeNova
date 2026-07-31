using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Recognition;

public abstract class AiOrderRecognitionProviderBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IOptionsMonitor<AiOrderRecognitionOptions> _options;

    protected AiOrderRecognitionProviderBase(
        IHttpClientFactory httpClientFactory,
        IOptionsMonitor<AiOrderRecognitionOptions> options)
    {
        _httpClientFactory = httpClientFactory;
        _options = options;
    }

    protected AiOrderRecognitionProviderOptions ProviderOptions(string providerId) =>
        _options.CurrentValue.Providers.TryGetValue(providerId, out var provider) &&
        provider.Enabled &&
        !string.IsNullOrWhiteSpace(provider.ApiKey)
            ? provider
            : throw new AiOrderRecognitionProviderException(
                "RecognitionProviderDisabled",
                false);

    protected async Task<ProviderHttpResponse> SendAsync(
        string providerId,
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var options = _options.CurrentValue;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(options.RequestTimeoutSeconds));
        try
        {
            var client = _httpClientFactory.CreateClient("AiOrderRecognition");
            using var response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);
            var requestId = ReadRequestId(response);
            if (!response.IsSuccessStatusCode)
            {
                throw Classify(
                    response.StatusCode,
                    ReadRetryAfter(response),
                    requestId);
            }

            var maximumBytes = checked(options.MaximumOutputCharacters * 4L);
            var bytes = await ReadBoundedAsync(response.Content, maximumBytes, timeout.Token);
            return new ProviderHttpResponse(bytes, requestId);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new AiOrderRecognitionProviderException(
                "RecognitionProviderTimeout",
                true,
                innerException: exception);
        }
        catch (HttpRequestException exception)
        {
            throw new AiOrderRecognitionProviderException(
                "RecognitionProviderNetworkFailure",
                true,
                innerException: exception);
        }
    }

    protected static JsonDocument Parse(byte[] bytes)
    {
        try
        {
            return JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 64 });
        }
        catch (JsonException exception)
        {
            throw new AiOrderRecognitionProviderException(
                "RecognitionProviderResponseMalformed",
                false,
                innerException: exception);
        }
    }

    protected static string RequireString(JsonElement element, string safeCode)
    {
        if (element.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(element.GetString()))
            return element.GetString()!;
        throw new AiOrderRecognitionProviderException(safeCode, false);
    }

    protected static long? LongAt(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.TryGetInt64(out var number)
            ? number
            : null;

    private static AiOrderRecognitionProviderException Classify(
        HttpStatusCode status,
        TimeSpan? retryAfter,
        string? requestId)
    {
        var retryable = status == HttpStatusCode.TooManyRequests ||
                        status is HttpStatusCode.InternalServerError or
                            HttpStatusCode.BadGateway or
                            HttpStatusCode.ServiceUnavailable or
                            HttpStatusCode.GatewayTimeout;
        var safeCode = status switch
        {
            HttpStatusCode.TooManyRequests => "RecognitionProviderRateLimited",
            HttpStatusCode.Unauthorized => "RecognitionProviderAuthenticationFailed",
            HttpStatusCode.Forbidden => "RecognitionProviderAccessDenied",
            HttpStatusCode.NotFound => "RecognitionProviderModelUnavailable",
            HttpStatusCode.BadRequest => "RecognitionProviderRequestRejected",
            _ when retryable => "RecognitionProviderTransientFailure",
            _ => "RecognitionProviderPermanentFailure",
        };
        return new AiOrderRecognitionProviderException(
            safeCode,
            retryable,
            status,
            retryAfter,
            requestId);
    }

    private static async Task<byte[]> ReadBoundedAsync(
        HttpContent content,
        long maximumBytes,
        CancellationToken cancellationToken)
    {
        if (content.Headers.ContentLength > maximumBytes)
            throw new AiOrderRecognitionProviderException(
                "RecognitionProviderResponseTooLarge",
                false);
        await using var input = await content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var read = await input.ReadAsync(buffer, cancellationToken);
            if (read == 0)
                return output.ToArray();
            if (output.Length + read > maximumBytes)
                throw new AiOrderRecognitionProviderException(
                    "RecognitionProviderResponseTooLarge",
                    false);
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }

    private static string? ReadRequestId(HttpResponseMessage response)
    {
        foreach (var name in new[] { "x-request-id", "request-id", "x-goog-request-id" })
        {
            if (response.Headers.TryGetValues(name, out var values))
                return values.FirstOrDefault()?.Trim();
        }
        return null;
    }

    private static TimeSpan? ReadRetryAfter(HttpResponseMessage response)
    {
        var retry = response.Headers.RetryAfter;
        if (retry?.Delta is { } delta)
            return delta < TimeSpan.Zero ? TimeSpan.Zero : delta;
        if (retry?.Date is { } date)
        {
            var duration = date - DateTimeOffset.UtcNow;
            return duration < TimeSpan.Zero ? TimeSpan.Zero : duration;
        }
        return null;
    }

    protected sealed record ProviderHttpResponse(byte[] Body, string? RequestId);
}

public sealed class GeminiAiOrderRecognitionProvider :
    AiOrderRecognitionProviderBase,
    IAiOrderRecognitionProvider,
    ITransientDependency
{
    public string ProviderId => "gemini";

    public GeminiAiOrderRecognitionProvider(
        IHttpClientFactory httpClientFactory,
        IOptionsMonitor<AiOrderRecognitionOptions> options)
        : base(httpClientFactory, options)
    {
    }

    public async Task<AiOrderRecognitionResult> RecognizeAsync(
        AiOrderRecognitionRequest request,
        CancellationToken cancellationToken)
    {
        var provider = ProviderOptions(ProviderId);
        var parts = new JsonArray { new JsonObject { ["text"] = request.Prompt } };
        foreach (var source in request.OrderedSourceDocuments)
        {
            parts.Add(new JsonObject
            {
                ["inlineData"] = new JsonObject
                {
                    ["mimeType"] = source.ContentType,
                    ["data"] = Convert.ToBase64String(source.Content),
                },
            });
        }

        var body = new JsonObject
        {
            ["contents"] = new JsonArray
            {
                new JsonObject
                {
                    ["role"] = "user",
                    ["parts"] = parts,
                },
            },
            ["generationConfig"] = new JsonObject
            {
                ["responseMimeType"] = "application/json",
                ["responseJsonSchema"] = JsonNode.Parse(request.JsonSchema),
            },
        };
        var uri = new Uri(
            new Uri(provider.BaseUrl.TrimEnd('/') + "/"),
            $"v1beta/models/{Uri.EscapeDataString(request.Model)}:generateContent");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, uri);
        httpRequest.Headers.Add("x-goog-api-key", provider.ApiKey);
        httpRequest.Content = JsonContent(body);
        var response = await SendAsync(ProviderId, httpRequest, cancellationToken);
        using var document = Parse(response.Body);
        var root = document.RootElement;
        var output = RequireString(
            root.GetProperty("candidates")[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text"),
            "RecognitionProviderOutputMissing");
        var usage = root.TryGetProperty("usageMetadata", out var usageElement)
            ? new AiOrderRecognitionUsage(
                LongAt(usageElement, "promptTokenCount"),
                LongAt(usageElement, "candidatesTokenCount"),
                LongAt(usageElement, "cachedContentTokenCount"))
            : new AiOrderRecognitionUsage(null, null, null);
        var finish = root.GetProperty("candidates")[0].TryGetProperty("finishReason", out var reason)
            ? reason.GetString()
            : null;
        return new AiOrderRecognitionResult(
            output,
            response.Body,
            response.RequestId,
            finish,
            usage);
    }

    private static StringContent JsonContent(JsonNode body) =>
        new(body.ToJsonString(), Encoding.UTF8, "application/json");
}

public sealed class OpenAiOrderRecognitionProvider :
    AiOrderRecognitionProviderBase,
    IAiOrderRecognitionProvider,
    ITransientDependency
{
    public string ProviderId => "openai";

    public OpenAiOrderRecognitionProvider(
        IHttpClientFactory httpClientFactory,
        IOptionsMonitor<AiOrderRecognitionOptions> options)
        : base(httpClientFactory, options)
    {
    }

    public async Task<AiOrderRecognitionResult> RecognizeAsync(
        AiOrderRecognitionRequest request,
        CancellationToken cancellationToken)
    {
        var provider = ProviderOptions(ProviderId);
        var content = new JsonArray
        {
            new JsonObject { ["type"] = "input_text", ["text"] = request.Prompt },
        };
        foreach (var source in request.OrderedSourceDocuments)
        {
            if (source.ContentType == "application/pdf")
            {
                content.Add(new JsonObject
                {
                    ["type"] = "input_file",
                    ["filename"] = source.SafeLabel + ".pdf",
                    ["file_data"] =
                        $"data:application/pdf;base64,{Convert.ToBase64String(source.Content)}",
                });
            }
            else
            {
                content.Add(new JsonObject
                {
                    ["type"] = "input_image",
                    ["image_url"] =
                        $"data:{source.ContentType};base64,{Convert.ToBase64String(source.Content)}",
                    ["detail"] = "high",
                });
            }
        }

        var body = new JsonObject
        {
            ["model"] = request.Model,
            ["input"] = new JsonArray
            {
                new JsonObject { ["role"] = "user", ["content"] = content },
            },
            ["text"] = new JsonObject
            {
                ["format"] = new JsonObject
                {
                    ["type"] = "json_schema",
                    ["name"] = "tee_nova_ai_order_extraction_v1",
                    ["strict"] = true,
                    ["schema"] = JsonNode.Parse(request.JsonSchema),
                },
            },
        };
        var uri = new Uri(new Uri(provider.BaseUrl.TrimEnd('/') + "/"), "v1/responses");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, uri);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", provider.ApiKey);
        httpRequest.Headers.Add("Idempotency-Key", request.AttemptId.ToString("N"));
        httpRequest.Content = JsonContent(body);
        var response = await SendAsync(ProviderId, httpRequest, cancellationToken);
        using var document = Parse(response.Body);
        var root = document.RootElement;
        var output = RequireString(
            root.GetProperty("output")[0].GetProperty("content")[0].GetProperty("text"),
            "RecognitionProviderOutputMissing");
        var usage = root.TryGetProperty("usage", out var usageElement)
            ? new AiOrderRecognitionUsage(
                LongAt(usageElement, "input_tokens"),
                LongAt(usageElement, "output_tokens"),
                usageElement.TryGetProperty("input_tokens_details", out var details)
                    ? LongAt(details, "cached_tokens")
                    : null)
            : new AiOrderRecognitionUsage(null, null, null);
        var requestId = root.TryGetProperty("id", out var id) ? id.GetString() : response.RequestId;
        var finish = root.TryGetProperty("status", out var status) ? status.GetString() : null;
        return new AiOrderRecognitionResult(
            output,
            response.Body,
            requestId,
            finish,
            usage);
    }

    private static StringContent JsonContent(JsonNode body) =>
        new(body.ToJsonString(), Encoding.UTF8, "application/json");
}

public sealed class ClaudeAiOrderRecognitionProvider :
    AiOrderRecognitionProviderBase,
    IAiOrderRecognitionProvider,
    ITransientDependency
{
    public string ProviderId => "claude";

    public ClaudeAiOrderRecognitionProvider(
        IHttpClientFactory httpClientFactory,
        IOptionsMonitor<AiOrderRecognitionOptions> options)
        : base(httpClientFactory, options)
    {
    }

    public async Task<AiOrderRecognitionResult> RecognizeAsync(
        AiOrderRecognitionRequest request,
        CancellationToken cancellationToken)
    {
        var provider = ProviderOptions(ProviderId);
        var content = new JsonArray();
        foreach (var source in request.OrderedSourceDocuments)
        {
            var sourceObject = new JsonObject
            {
                ["type"] = "base64",
                ["media_type"] = source.ContentType,
                ["data"] = Convert.ToBase64String(source.Content),
            };
            content.Add(new JsonObject
            {
                ["type"] = source.ContentType == "application/pdf" ? "document" : "image",
                ["source"] = sourceObject,
            });
        }
        content.Add(new JsonObject
        {
            ["type"] = "text",
            ["text"] = "Extract the attached sources using the system instructions.",
        });

        var body = new JsonObject
        {
            ["model"] = request.Model,
            ["max_tokens"] = 8_000,
            ["system"] = request.Prompt,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "user", ["content"] = content },
            },
            ["output_config"] = new JsonObject
            {
                ["format"] = new JsonObject
                {
                    ["type"] = "json_schema",
                    ["schema"] = JsonNode.Parse(request.JsonSchema),
                },
            },
        };
        var uri = new Uri(new Uri(provider.BaseUrl.TrimEnd('/') + "/"), "v1/messages");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, uri);
        httpRequest.Headers.Add("x-api-key", provider.ApiKey);
        httpRequest.Headers.Add("anthropic-version", "2023-06-01");
        httpRequest.Content = JsonContent(body);
        var response = await SendAsync(ProviderId, httpRequest, cancellationToken);
        using var document = Parse(response.Body);
        var root = document.RootElement;
        var output = RequireString(
            root.GetProperty("content")[0].GetProperty("text"),
            "RecognitionProviderOutputMissing");
        var usage = root.TryGetProperty("usage", out var usageElement)
            ? new AiOrderRecognitionUsage(
                LongAt(usageElement, "input_tokens"),
                LongAt(usageElement, "output_tokens"),
                LongAt(usageElement, "cache_read_input_tokens"))
            : new AiOrderRecognitionUsage(null, null, null);
        var requestId = root.TryGetProperty("id", out var id) ? id.GetString() : response.RequestId;
        var finish = root.TryGetProperty("stop_reason", out var reason) ? reason.GetString() : null;
        return new AiOrderRecognitionResult(
            output,
            response.Body,
            requestId,
            finish,
            usage);
    }

    private static StringContent JsonContent(JsonNode body) =>
        new(body.ToJsonString(), Encoding.UTF8, "application/json");
}
