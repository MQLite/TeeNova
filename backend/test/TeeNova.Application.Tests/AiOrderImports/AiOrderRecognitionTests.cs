using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Recognition;
using Volo.Abp;
using Xunit;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderRecognitionTests
{
    private static readonly Guid SourceId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    /// <summary>
    /// JSON Schema keywords that could appear in the extraction schema. Names matching a
    /// contract field (for example "value" or "page") are not keywords and are excluded.
    /// </summary>
    private static readonly HashSet<string> KnownJsonSchemaKeywords = new(StringComparer.Ordinal)
    {
        "type", "properties", "required", "additionalProperties", "items", "enum", "const",
        "anyOf", "allOf", "oneOf", "not", "$ref", "$defs", "definitions", "$schema", "$id",
        "$comment", "title", "description", "default", "examples", "deprecated", "readOnly",
        "writeOnly", "format", "pattern", "patternProperties", "propertyNames",
        "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
        "minItems", "maxItems", "uniqueItems", "contains", "minContains", "maxContains",
        "minLength", "maxLength", "minProperties", "maxProperties",
        "unevaluatedItems", "unevaluatedProperties", "if", "then", "else",
    };

    [Fact]
    public void Prompt_treats_document_instructions_as_untrusted_content()
    {
        var prompt = new AiOrderRecognitionPromptBuilder().Build("NZD", "en-NZ", [Descriptor()]);

        Assert.Contains("untrusted document content", prompt);
        Assert.Contains("ignore previous instructions", prompt);
        Assert.Contains("Do not create or infer catalogue ProductId", prompt);
        Assert.Contains("explicitly stated zero", prompt);
    }

    [Fact]
    public void Prompt_lists_the_source_ids_the_model_is_required_to_cite()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();

        var prompt = new AiOrderRecognitionPromptBuilder().Build(
            "NZD",
            "en-NZ",
            [
                new AiOrderRecognitionSourceDescriptor(
                    second, 2, "application/pdf", 10, "b".PadLeft(64, 'b'), 0, 3),
                new AiOrderRecognitionSourceDescriptor(
                    first, 1, "image/jpeg", 10, "a".PadLeft(64, 'a'), 0, null),
            ]);

        // Listed in attachment order, not the order they were handed to the builder.
        var firstIndex = prompt.IndexOf(first.ToString(), StringComparison.Ordinal);
        var secondIndex = prompt.IndexOf(second.ToString(), StringComparison.Ordinal);
        Assert.True(firstIndex >= 0 && secondIndex > firstIndex);
        Assert.Contains("pages=3", prompt);
        Assert.Contains("copied exactly from this list", prompt);
    }

    [Theory]
    [InlineData("openai")]
    [InlineData("gemini")]
    [InlineData("claude")]
    public async Task Every_adapter_labels_its_attachments_with_the_source_id(string providerId)
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, ResponseFor(providerId));
        IAiOrderRecognitionProvider provider = providerId switch
        {
            "openai" => new OpenAiOrderRecognitionProvider(
                new TestHttpClientFactory(handler), Monitor(providerId)),
            "gemini" => new GeminiAiOrderRecognitionProvider(
                new TestHttpClientFactory(handler), Monitor(providerId)),
            _ => new ClaudeAiOrderRecognitionProvider(
                new TestHttpClientFactory(handler), Monitor(providerId)),
        };

        await provider.RecognizeAsync(Request(providerId, "model-1"), default);

        // Without this the model has to invent an id and the extraction is rejected.
        Assert.Contains(SourceId.ToString(), handler.Body);
    }

    private static string ResponseFor(string providerId) => providerId switch
    {
        "openai" =>
            """{"id":"r","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}]}""",
        "gemini" =>
            """{"candidates":[{"content":{"parts":[{"text":"{}"}]}}]}""",
        _ =>
            """{"id":"m","content":[{"type":"text","text":"{}"}]}""",
    };

    private static AiOrderRecognitionSourceDescriptor Descriptor() =>
        new(SourceId, 1, "image/jpeg", 1024, "a".PadLeft(64, 'a'), 0, null);

    [Fact]
    public void Valid_structured_output_is_canonicalized_and_hashed()
    {
        var validator = Validator();

        var result = validator.ValidateAndCanonicalize(ValidJson());

        Assert.Equal(64, result.CanonicalSha256.Length);
        Assert.StartsWith("{\"contractVersion\":\"1.0\"", result.CanonicalJson);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("""{"contractVersion":"2.0","customer":{},"productGroups":[],"financials":{},"warnings":[]}""")]
    public void Malformed_or_unsupported_output_is_rejected(string json)
    {
        Assert.Throws<BusinessException>(() =>
            Validator().ValidateAndCanonicalize(json));
    }

    [Theory]
    [InlineData("1.1")]
    [InlineData("-0.1")]
    public void Invalid_confidence_is_rejected(string confidence)
    {
        var json = ValidNode();
        json["customer"]!["name"]!["confidence"] = decimal.Parse(
            confidence,
            System.Globalization.CultureInfo.InvariantCulture);

        Assert.Throws<BusinessException>(() =>
            Validator().ValidateAndCanonicalize(json.ToJsonString()));
    }

    [Theory]
    [InlineData("1")]
    [InlineData("1.234")]
    [InlineData("-1.00")]
    [InlineData("01.00")]
    public void Invalid_money_is_rejected(string amount)
    {
        var json = ValidNode();
        json["financials"]!["depositPaid"]!["value"]!["amount"] = amount;

        Assert.Throws<BusinessException>(() =>
            Validator().ValidateAndCanonicalize(json.ToJsonString()));
    }

    [Fact]
    public void Fractional_quantity_is_rejected()
    {
        var json = ValidNode();
        json["productGroups"]![0]!["sizeQuantityRows"]![0]!["quantity"]!["value"] = 1.5;

        Assert.Throws<BusinessException>(() =>
            Validator().ValidateAndCanonicalize(json.ToJsonString()));
    }

    [Fact]
    public void Missing_deposit_must_remain_null()
    {
        var json = ValidNode();
        json["financials"]!["depositPaid"]!["presence"] = "missing";

        Assert.Throws<BusinessException>(() =>
            Validator().ValidateAndCanonicalize(json.ToJsonString()));
    }

    [Fact]
    public void Explicit_zero_deposit_remains_stated_zero()
    {
        var result = Validator().ValidateAndCanonicalize(ValidJson());

        Assert.Contains("\"amount\":\"0.00\"", result.CanonicalJson);
        Assert.Contains("\"presence\":\"stated\"", result.CanonicalJson);
    }

    [Theory]
    [InlineData("productId")]
    [InlineData("variantId")]
    [InlineData("sku")]
    [InlineData("orderId")]
    [InlineData("apiKey")]
    [InlineData("privateObjectKey")]
    [InlineData("instructions")]
    public void Provider_cannot_invent_catalogue_or_order_identifiers(string forbidden)
    {
        var json = ValidNode();
        json["productGroups"]![0]![forbidden] = "invented";

        Assert.Throws<BusinessException>(() =>
            Validator().ValidateAndCanonicalize(json.ToJsonString()));
    }

    [Fact]
    public void Unknown_source_reference_is_rejected()
    {
        var validator = Validator();
        var result = validator.ValidateAndCanonicalize(ValidJson());

        Assert.Throws<BusinessException>(() =>
            validator.ValidateSourceReferences(
                result.CanonicalJson,
                new Dictionary<Guid, int?>()));
    }

    [Fact]
    public void Known_source_reference_is_accepted()
    {
        var validator = Validator();
        var result = validator.ValidateAndCanonicalize(ValidJson());

        validator.ValidateSourceReferences(
            result.CanonicalJson,
            new Dictionary<Guid, int?> { [SourceId] = 1 });
    }

    [Fact]
    public void Source_page_beyond_known_pdf_page_count_is_rejected()
    {
        var validator = Validator();
        var json = ValidJson().Replace("\"page\":1", "\"page\":2", StringComparison.Ordinal);
        var result = validator.ValidateAndCanonicalize(json);

        Assert.Throws<BusinessException>(() =>
            validator.ValidateSourceReferences(
                result.CanonicalJson,
                new Dictionary<Guid, int?> { [SourceId] = 1 }));
    }

    [Fact]
    public void Oversized_output_is_rejected()
    {
        var options = CreateOptions();
        options.MaximumOutputCharacters = 10;
        var validator = new AiOrderRecognitionStructuralValidator(Options.Create(options));

        Assert.Throws<BusinessException>(() =>
            validator.ValidateAndCanonicalize(ValidJson()));
    }

    [Theory]
    [InlineData(0, 2, 120, 0, 2)]
    [InlineData(1, 2, 120, 0, 4)]
    [InlineData(20, 2, 120, 1, 120)]
    public void Retry_backoff_is_exponential_capped_and_jitter_bounded(
        int retry,
        int baseSeconds,
        int maximumSeconds,
        double jitter,
        int expectedSeconds)
    {
        var delay = AiOrderRecognitionProcessor.CalculateRetryDelay(
            retry,
            baseSeconds,
            maximumSeconds,
            null,
            jitter);

        Assert.Equal(expectedSeconds, (int)delay.TotalSeconds);
    }

    [Fact]
    public void Retry_after_is_honoured_but_capped()
    {
        Assert.Equal(
            45,
            AiOrderRecognitionProcessor.CalculateRetryDelay(
                0,
                2,
                120,
                TimeSpan.FromSeconds(45),
                0).TotalSeconds);
        Assert.Equal(
            120,
            AiOrderRecognitionProcessor.CalculateRetryDelay(
                0,
                2,
                120,
                TimeSpan.FromMinutes(10),
                0).TotalSeconds);
    }

    [Fact]
    public void Cost_estimate_and_actual_cost_use_selected_snapshot_rates()
    {
        var estimator = new AiOrderRecognitionCostEstimator();
        var selection = Selection();
        var estimate = estimator.Estimate(
            selection,
            [new AiOrderRecognitionSourceDescriptor(SourceId, 1, "image/jpeg", 1_048_576, "a".PadLeft(64, 'a'), 0, 1)]);

        Assert.Equal(3_000, estimate.EstimatedInputTokens);
        Assert.Equal(0.051m, estimate.EstimatedCostUsd);
        Assert.Equal(
            0.0023m,
            estimator.CalculateActual(
                selection,
                new AiOrderRecognitionUsage(2_000, 200, 1_000)));
    }

    [Fact]
    public void Image_estimate_ignores_upload_size_because_sources_are_downscaled_first()
    {
        var estimator = new AiOrderRecognitionCostEstimator();
        var selection = Selection();

        var small = estimator.Estimate(
            selection,
            [Descriptor("image/jpeg", 512 * 1024)]);
        var huge = estimator.Estimate(
            selection,
            [Descriptor("image/jpeg", 15L * 1024 * 1024)]);

        Assert.Equal(3_000, small.EstimatedInputTokens);
        Assert.Equal(small.EstimatedInputTokens, huge.EstimatedInputTokens);
    }

    [Fact]
    public void Pdf_estimate_still_scales_with_bytes_because_pdfs_are_not_compressed()
    {
        var estimator = new AiOrderRecognitionCostEstimator();
        var selection = Selection();

        var estimate = estimator.Estimate(
            selection,
            [
                Descriptor("application/pdf", 2 * 1024 * 1024),
                Descriptor("image/png", 9L * 1024 * 1024),
            ]);

        // 2 MB of PDF at 300k tokens/MB, plus one flat-rate image.
        Assert.Equal(603_000, estimate.EstimatedInputTokens);
    }

    private static AiOrderRecognitionSourceDescriptor Descriptor(string contentType, long bytes) =>
        new(Guid.NewGuid(), 1, contentType, bytes, "a".PadLeft(64, 'a'), 0, 1);

    [Fact]
    public void Disabled_or_uncredentialed_providers_are_hidden()
    {
        var options = CreateOptions();
        options.Enabled = true;
        options.Providers["openai"] = ProviderOptions(enabled: true, apiKey: "");
        var registry = new AiOrderRecognitionModelRegistry(Options.Create(options));

        Assert.Empty(registry.GetEnabledOptions());
        Assert.Throws<BusinessException>(() =>
            registry.ResolveEnabled("openai", "gpt-5.4-nano"));
    }

    [Fact]
    public void Only_exact_enabled_allowlisted_model_resolves()
    {
        var options = CreateOptions();
        options.Enabled = true;
        options.Providers["openai"] = ProviderOptions(enabled: true, apiKey: "test-only");
        var registry = new AiOrderRecognitionModelRegistry(Options.Create(options));

        Assert.Equal("gpt-5.4-nano", registry.ResolveEnabled("openai", "gpt-5.4-nano").ModelId);
        Assert.Throws<BusinessException>(() =>
            registry.ResolveEnabled("openai", "arbitrary-model"));
    }

    [Fact]
    public void Enabled_provider_without_key_fails_configuration_validation()
    {
        var options = CreateOptions();
        options.Providers["openai"] = ProviderOptions(enabled: true, apiKey: "");

        var result = new AiOrderRecognitionOptionsValidator().Validate(null, options);

        Assert.True(result.Failed);
    }

    [Fact]
    public void Strict_schema_keeps_the_constraints_that_shape_the_model_output()
    {
        var sanitized = OpenAiStrictSchema.Sanitize(
            """
            {"type":"object","additionalProperties":false,
             "required":["confidence","pattern","rows","open"],
             "properties":{
               "version":{"type":"string","const":"1.0"},
               "confidence":{"type":"number","minimum":0,"maximum":1},
               "pattern":{"type":"string","pattern":"^[a-z]{3}$","maxLength":8},
               "rows":{"type":"array","maxItems":40,"uniqueItems":true,
                       "items":{"type":"string","format":"uuid"}},
               "open":{},
               "mode":{"type":"string","enum":["A","B"]}}}
            """).ToJsonString();

        // Confirmed supported against the live API. Stripping these was the cause of
        // InvalidMoney: without "pattern" a model may return "100" rather than "100.00".
        Assert.Contains("\"minimum\":0", sanitized);
        Assert.Contains("\"maximum\":1", sanitized);
        Assert.Contains("\"maxItems\":40", sanitized);
        Assert.Contains("\"maxLength\":8", sanitized);
        Assert.Contains("\"format\":\"uuid\"", sanitized);
        Assert.Contains("\"const\":\"1.0\"", sanitized);
        Assert.Contains("\"pattern\":\"^[a-z]{3}$\"", sanitized);
        // Confirmed rejected by the API.
        Assert.DoesNotContain("uniqueItems", sanitized);
        // An untyped schema is rejected with "schema must have a 'type' key".
        Assert.Contains("\"open\":{\"type\":[\"string\",\"number\",\"boolean\",\"null\"]}", sanitized);
        Assert.Contains("\"enum\":[\"A\",\"B\"]", sanitized);
        Assert.Contains("\"additionalProperties\":false", sanitized);
    }

    [Fact]
    public void Real_extraction_schema_survives_strict_sanitisation()
    {
        var validator = Validator();

        var sanitized = OpenAiStrictSchema.Sanitize(validator.JsonSchema).ToJsonString();

        // The money format must survive: the structural validator enforces the same regex,
        // so a schema without it produces extractions we then reject ourselves.
        Assert.Contains("^(0|[1-9][0-9]*)\\\\.[0-9]{2}$", sanitized);
        Assert.Contains("^[A-Z]{3}$", sanitized);

        // Allowlist, not denylist: a keyword we have never met must fail here rather than
        // as an opaque "invalid_json_schema" 400 from the provider. Every entry was
        // confirmed accepted by the live API.
        var supported = new HashSet<string>(StringComparer.Ordinal)
        {
            "type", "properties", "required", "additionalProperties", "items",
            "enum", "anyOf", "$ref", "$defs", "const", "pattern", "format",
            "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength",
            "description",
        };
        var used = System.Text.RegularExpressions.Regex
            .Matches(sanitized, "\"(\\$?[A-Za-z][A-Za-z0-9$]*)\"\\s*:")
            .Select(match => match.Groups[1].Value)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var keywords = used
            .Where(name => supported.Contains(name) || KnownJsonSchemaKeywords.Contains(name))
            .ToArray();
        Assert.All(keywords, keyword => Assert.Contains(keyword, supported));
        // $defs/$ref and anyOf are supported by strict mode and must be preserved.
        Assert.Contains("$defs", sanitized);
        Assert.Contains("$ref", sanitized);
        Assert.Contains("\"additionalProperties\":false", sanitized);
        // Confirmed by live bisection: the full schema is rejected when a complex nullable
        // keeps the union spelling, and accepted once it becomes anyOf. Scalar unions are
        // fine as written. A minimal schema accepts both, so only the real one shows this.
        Assert.Contains("[\"string\",\"null\"]", sanitized);
        Assert.DoesNotContain("[\"array\",\"null\"]", sanitized);
        Assert.DoesNotContain("[\"object\",\"null\"]", sanitized);
        // Verified against the live API: strict mode rejects an untyped schema with
        // "schema must have a 'type' key", so no node may reach it without one.
        Assert.Empty(UntypedNodes(JsonNode.Parse(sanitized)!, "$"));
    }

    /// <summary>Schema nodes carrying neither type, $ref, anyOf nor enum.</summary>
    private static List<string> UntypedNodes(JsonNode? node, string path)
    {
        var found = new List<string>();
        if (node is JsonArray array)
        {
            for (var index = 0; index < array.Count; index++)
                found.AddRange(UntypedNodes(array[index], $"{path}[{index}]"));
            return found;
        }
        if (node is not JsonObject o)
            return found;

        if (!o.ContainsKey("type") && !o.ContainsKey("$ref") &&
            !o.ContainsKey("anyOf") && !o.ContainsKey("enum"))
            found.Add(path);

        foreach (var (key, value) in o)
        {
            if (key is "properties" or "$defs" && value is JsonObject map)
            {
                foreach (var (name, child) in map)
                    found.AddRange(UntypedNodes(child, $"{path}.{key}.{name}"));
                continue;
            }
            if (key is "required" or "enum" or "type")
                continue;
            found.AddRange(UntypedNodes(value, $"{path}.{key}"));
        }
        return found;
    }

    [Fact]
    public void Sanitised_schema_meets_strict_modes_structural_rules()
    {
        // Strict Structured Outputs also demands: every object closes additionalProperties,
        // every property is listed in required, and a $ref carries no sibling keys.
        var schema = JsonNode.Parse(
            OpenAiStrictSchema.Sanitize(Validator().JsonSchema).ToJsonString())!;
        var problems = new List<string>();

        Walk(schema, "$", problems);

        Assert.True(problems.Count == 0, string.Join(Environment.NewLine, problems));

        static void Walk(JsonNode? node, string path, List<string> problems)
        {
            if (node is JsonArray array)
            {
                for (var index = 0; index < array.Count; index++)
                    Walk(array[index], $"{path}[{index}]", problems);
                return;
            }
            if (node is not JsonObject o)
                return;

            if (o.ContainsKey("$ref") && o.Count > 1)
                problems.Add($"{path}: $ref has sibling keys");

            // Nullable fields are declared as "type":["object","null"].
            var kinds = o["type"] switch
            {
                JsonValue single when single.TryGetValue<string>(out var name) => [name],
                JsonArray many => many
                    .Select(item => item?.GetValue<string>() ?? string.Empty)
                    .ToArray(),
                _ => Array.Empty<string>(),
            };
            if (kinds.Contains("object"))
            {
                if (o["additionalProperties"]?.GetValue<bool>() != false)
                    problems.Add($"{path}: additionalProperties is not false");
                var declared = (o["properties"] as JsonObject)?
                    .Select(pair => pair.Key)
                    .OrderBy(name => name, StringComparer.Ordinal)
                    .ToArray() ?? [];
                var required = (o["required"] as JsonArray)?
                    .Select(item => item!.GetValue<string>())
                    .OrderBy(name => name, StringComparer.Ordinal)
                    .ToArray() ?? [];
                if (!declared.SequenceEqual(required, StringComparer.Ordinal))
                    problems.Add(
                        $"{path}: required [{string.Join(",", required)}] " +
                        $"does not cover properties [{string.Join(",", declared)}]");
            }

            foreach (var (key, value) in o)
            {
                if (key is "properties" or "$defs" or "definitions" && value is JsonObject map)
                {
                    foreach (var (name, child) in map)
                        Walk(child, $"{path}.{key}.{name}", problems);
                    continue;
                }
                Walk(value, $"{path}.{key}", problems);
            }
        }
    }

    [Fact]
    public async Task Openai_request_carries_the_constraints_and_no_rejected_keyword()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"id":"resp_1","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}]}""");
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));
        var request = Request("openai", "gpt-5.6-luna") with
        {
            JsonSchema = Validator().JsonSchema,
        };

        await provider.RecognizeAsync(request, default);

        // The money pattern must reach the model, or it returns "100" for "100.00" and the
        // structural validator rejects the extraction with InvalidMoney.
        Assert.Contains("[0-9]{2}", handler.Body);
        Assert.Contains("\"maxItems\"", handler.Body);
        Assert.DoesNotContain("\"uniqueItems\"", handler.Body);
        Assert.Contains("\"strict\":true", handler.Body);
    }

    [Fact]
    public async Task Provider_error_body_is_captured_for_diagnosis_but_stays_out_of_the_safe_code()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.BadRequest,
            """{"error":{"type":"invalid_request_error","code":null,"param":"text.format.schema","message":"Invalid schema: 'maxItems' is not permitted."}}""");
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        var exception = await Assert.ThrowsAsync<AiOrderRecognitionProviderException>(() =>
            provider.RecognizeAsync(Request("openai", "gpt-5.6-luna"), default));

        Assert.Equal("RecognitionProviderRequestRejected", exception.SafeCode);
        Assert.Contains("invalid_request_error", exception.Diagnostic);
        Assert.Contains("maxItems", exception.Diagnostic);
        Assert.DoesNotContain("maxItems", exception.SafeCode);
    }

    [Fact]
    public async Task Openai_adapter_reads_the_message_item_past_a_leading_reasoning_item()
    {
        // Reasoning models put a reasoning item first; the answer is in the message item.
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """
            {"id":"resp_1","status":"completed","output":[
              {"id":"rs_1","type":"reasoning","summary":[]},
              {"id":"msg_1","type":"message","role":"assistant","status":"completed",
               "content":[{"type":"output_text","text":"{\"ok\":1}","annotations":[]}]}],
             "usage":{"input_tokens":12,"output_tokens":5}}
            """);
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        var result = await provider.RecognizeAsync(Request("openai", "gpt-5.6-luna"), default);

        Assert.Equal("{\"ok\":1}", result.StructuredOutputJson);
    }

    [Fact]
    public async Task Openai_adapter_surfaces_a_refusal_as_a_safe_code()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """
            {"id":"resp_1","status":"completed","output":[
              {"id":"msg_1","type":"message","role":"assistant",
               "content":[{"type":"refusal","refusal":"I cannot help with that."}]}]}
            """);
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        var exception = await Assert.ThrowsAsync<AiOrderRecognitionProviderException>(() =>
            provider.RecognizeAsync(Request("openai", "gpt-5.6-luna"), default));

        Assert.Equal("RecognitionProviderOutputMissing", exception.SafeCode);
        Assert.False(exception.IsRetryable);
    }

    [Fact]
    public async Task Claude_adapter_reads_the_text_block_past_a_leading_thinking_block()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """
            {"id":"msg_1","stop_reason":"end_turn","content":[
              {"type":"thinking","thinking":"working through the form"},
              {"type":"text","text":"{\"ok\":1}"}]}
            """);
        var provider = new ClaudeAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("claude"));

        var result = await provider.RecognizeAsync(
            Request("claude", "claude-haiku-4-5-20251001"),
            default);

        Assert.Equal("{\"ok\":1}", result.StructuredOutputJson);
    }

    [Fact]
    public async Task Gemini_adapter_skips_thought_parts_when_reading_the_answer()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """
            {"candidates":[{"finishReason":"STOP","content":{"parts":[
              {"text":"considering the layout","thought":true},
              {"text":"{\"ok\":1}"}]}}]}
            """);
        var provider = new GeminiAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("gemini"));

        var result = await provider.RecognizeAsync(
            Request("gemini", "gemini-2.5-flash-lite"),
            default);

        Assert.Equal("{\"ok\":1}", result.StructuredOutputJson);
    }

    [Fact]
    public async Task Unexpected_response_shapes_fail_with_a_safe_code_not_a_raw_exception()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, """{"id":"resp_1"}""");
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        var exception = await Assert.ThrowsAsync<AiOrderRecognitionProviderException>(() =>
            provider.RecognizeAsync(Request("openai", "gpt-5.6-luna"), default));

        Assert.Equal("RecognitionProviderOutputMissing", exception.SafeCode);
    }

    [Fact]
    public async Task Openai_adapter_uses_responses_strict_schema_and_maps_usage()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"id":"resp_1","status":"completed","output":[{"content":[{"text":"{}"}]}],"usage":{"input_tokens":12,"output_tokens":5,"input_tokens_details":{"cached_tokens":3}}}""");
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        var result = await provider.RecognizeAsync(Request("openai", "gpt-5.4-nano"), default);

        Assert.EndsWith("/v1/responses", handler.Uri!.AbsoluteUri);
        Assert.Contains("\"strict\":true", handler.Body);
        Assert.Contains("\"input_image\"", handler.Body);
        Assert.Equal("Bearer", handler.AuthorizationScheme);
        Assert.Equal(12, result.Usage.InputTokens);
        Assert.Equal(3, result.Usage.CachedInputTokens);
        Assert.Equal("resp_1", result.ProviderRequestId);
        Assert.DoesNotContain("test-provider-key", result.StructuredOutputJson);
    }

    [Fact]
    public async Task Gemini_adapter_uses_generate_content_schema_and_maps_usage()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"candidates":[{"content":{"parts":[{"text":"{}"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":11,"candidatesTokenCount":4,"cachedContentTokenCount":2}}""");
        handler.ResponseHeaders["x-goog-request-id"] = "gemini-request";
        var provider = new GeminiAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("gemini"));

        var result = await provider.RecognizeAsync(
            Request("gemini", "gemini-2.5-flash-lite"),
            default);

        Assert.Contains(":generateContent", handler.Uri!.AbsoluteUri);
        Assert.Contains("\"responseJsonSchema\"", handler.Body);
        Assert.Contains("\"inlineData\"", handler.Body);
        Assert.Equal("test-provider-key", handler.ApiKeyHeader);
        Assert.Equal("gemini-request", result.ProviderRequestId);
        Assert.Equal(2, result.Usage.CachedInputTokens);
    }

    [Fact]
    public async Task Claude_adapter_uses_messages_native_schema_and_maps_usage()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"id":"msg_1","content":[{"type":"text","text":"{}"}],"stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":3,"cache_read_input_tokens":1}}""");
        var provider = new ClaudeAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("claude"));

        var result = await provider.RecognizeAsync(
            Request("claude", "claude-haiku-4-5-20251001"),
            default);

        Assert.EndsWith("/v1/messages", handler.Uri!.AbsoluteUri);
        Assert.Contains("\"output_config\"", handler.Body);
        Assert.Contains("\"type\":\"image\"", handler.Body);
        Assert.Equal("test-provider-key", handler.ApiKeyHeader);
        Assert.Equal("msg_1", result.ProviderRequestId);
        Assert.Equal(1, result.Usage.CachedInputTokens);
    }

    [Fact]
    public async Task Openai_pdf_uses_native_responses_input_file()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"id":"resp_pdf","status":"completed","output":[{"content":[{"text":"{}"}]}]}""");
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        await provider.RecognizeAsync(
            Request("openai", "gpt-5.4-nano", "application/pdf"),
            default);

        Assert.Contains("\"type\":\"input_file\"", handler.Body);
        Assert.Contains("\"filename\":\"source-1.pdf\"", handler.Body);
        Assert.DoesNotContain("PrivateObjectKey", handler.Body);
    }

    [Fact]
    public async Task Gemini_pdf_uses_native_inline_pdf_data()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"candidates":[{"content":{"parts":[{"text":"{}"}]}}]}""");
        var provider = new GeminiAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("gemini"));

        await provider.RecognizeAsync(
            Request("gemini", "gemini-2.5-flash-lite", "application/pdf"),
            default);

        Assert.Contains("\"mimeType\":\"application/pdf\"", handler.Body);
    }

    [Fact]
    public async Task Claude_pdf_uses_native_document_block()
    {
        var handler = new RecordingHandler(
            HttpStatusCode.OK,
            """{"id":"msg_pdf","content":[{"type":"text","text":"{}"}],"usage":{}}""");
        var provider = new ClaudeAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("claude"));

        await provider.RecognizeAsync(
            Request("claude", "claude-haiku-4-5-20251001", "application/pdf"),
            default);

        Assert.Contains("\"type\":\"document\"", handler.Body);
        Assert.Contains("\"media_type\":\"application/pdf\"", handler.Body);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests, true)]
    [InlineData(HttpStatusCode.InternalServerError, true)]
    [InlineData(HttpStatusCode.Unauthorized, false)]
    [InlineData(HttpStatusCode.Forbidden, false)]
    [InlineData(HttpStatusCode.BadRequest, false)]
    public async Task Provider_http_failures_are_safely_classified(
        HttpStatusCode status,
        bool retryable)
    {
        var handler = new RecordingHandler(status, """{"secret":"must-not-surface"}""");
        handler.RetryAfter = TimeSpan.FromSeconds(7);
        var provider = new OpenAiOrderRecognitionProvider(
            new TestHttpClientFactory(handler),
            Monitor("openai"));

        var exception = await Assert.ThrowsAsync<AiOrderRecognitionProviderException>(() =>
            provider.RecognizeAsync(Request("openai", "gpt-5.4-nano"), default));

        Assert.Equal(retryable, exception.IsRetryable);
        Assert.DoesNotContain("must-not-surface", exception.Message);
        if (status == HttpStatusCode.TooManyRequests)
            Assert.Equal(7, exception.RetryAfter!.Value.TotalSeconds);
    }

    [Fact]
    public void Attempt_snapshots_are_immutable_and_stale_worker_result_is_rejected()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var attempt = RecognitionAttempt(now);
        attempt.ClaimWorker("worker-one", now.AddMinutes(5), now);

        Assert.Throws<BusinessException>(() =>
            attempt.ConfigureRecognition(
                "Responses",
                "v1",
                AiOrderRecognitionVersions.Prompt,
                AiOrderRecognitionVersions.Contract,
                "json_schema",
                "price-v1",
                """{"version":"price-v1"}""",
                "[]",
                "another-key",
                "b".PadLeft(64, 'b'),
                0.1m));
        Assert.Throws<BusinessException>(() =>
            attempt.Complete(
                now.AddSeconds(1),
                "request",
                null,
                null,
                workerClaimToken: "worker-two"));
    }

    [Fact]
    public void Successful_attempt_persists_usage_cost_finish_and_raw_retention_evidence()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var attempt = RecognitionAttempt(now);
        attempt.ClaimWorker("worker", now.AddMinutes(5), now);
        attempt.Complete(
            now.AddSeconds(2),
            "request-1",
            "raw-provider-evidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "c".PadLeft(64, 'c'),
            100,
            20,
            10,
            "completed",
            0.001234m,
            2_000,
            now.AddDays(30),
            "worker");

        Assert.Equal(AiOrderProcessingAttemptOutcome.Succeeded, attempt.Outcome);
        Assert.Equal(10, attempt.CachedInputTokenCount);
        Assert.Equal(0.001234m, attempt.ActualCostUsd);
        Assert.Equal("completed", attempt.FinishReason);
        Assert.Equal(now.AddDays(30), attempt.RawResultRetentionUntil);
        Assert.Throws<BusinessException>(() =>
            attempt.MarkRawResultDeleted(now.AddDays(29)));
        attempt.MarkRawResultDeleted(now.AddDays(30));
        Assert.Equal(now.AddDays(30), attempt.RawResultDeletedAt);
    }

    [Fact]
    public void Needs_review_import_cannot_be_silently_reprocessed()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var import = NewImport();
        import.ClaimProcessingLease("lease-one", now.AddMinutes(5), now);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease-one", now);

        Assert.Throws<BusinessException>(() =>
            import.ClaimProcessingLease("lease-two", now.AddMinutes(5), now));
    }

    [Fact]
    public void Expired_same_attempt_lease_can_be_recovered_without_new_provider_selection()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var import = NewImport();
        import.ClaimProcessingLease("lease", now.AddMinutes(1), now);

        import.RenewProcessingLease("lease", now.AddMinutes(6), now.AddMinutes(2));

        Assert.Equal(now.AddMinutes(6), import.ActiveProcessingLeaseExpiresAt);
        Assert.Equal(AiOrderImportStatus.Processing, import.Status);
    }

    [Fact]
    public async Task Fake_provider_runtime_success_ends_only_in_needs_review()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var import = NewImport();
        import.ClaimProcessingLease("lease", now.AddMinutes(5), now);
        var attempt = RecognitionAttempt(now, import.Id);
        attempt.ClaimWorker("worker", now.AddMinutes(5), now);
        var provider = new FakeProvider("openai", ValidJson());

        var result = await provider.RecognizeAsync(
            Request("openai", "gpt-5.4-nano"),
            default);
        var validated = Validator().ValidateAndCanonicalize(result.StructuredOutputJson);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease", now.AddSeconds(1));
        attempt.Complete(
            now.AddSeconds(1),
            "fake-request",
            null,
            "e".PadLeft(64, 'e'),
            10,
            5,
            workerClaimToken: "worker");
        var revision = new AiOrderImportRevision(
            Guid.NewGuid(),
            import.Id,
            1,
            "1.0",
            AiOrderRecognitionVersions.StructuralValidation,
            validated.CanonicalJson,
            validated.CanonicalSha256,
            AiOrderRevisionSource.AI,
            import.CreatedByAdminId,
            now.AddSeconds(1));
        revision.AttributeRecognition(
            attempt.Id,
            "openai",
            "gpt-5.4-nano",
            AiOrderRecognitionVersions.Prompt,
            "json_schema",
            "price-v1");

        Assert.Equal(1, provider.CallCount);
        Assert.Equal(AiOrderImportStatus.NeedsReview, import.Status);
        Assert.Equal(1, import.CurrentRevision);
        Assert.Equal(attempt.Id, revision.ProcessingAttemptId);
        Assert.Null(import.FormalOrderId);
    }

    [Fact]
    public void Retry_preserves_failed_attempt_and_allows_deliberate_provider_change()
    {
        var now = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
        var import = NewImport();
        import.ClaimProcessingLease("first-lease", now.AddMinutes(5), now);
        var first = RecognitionAttempt(now, import.Id, "first-lease");
        first.Fail(
            now.AddSeconds(1),
            "RecognitionProviderRateLimited",
            true,
            now.AddMinutes(1));
        import.FailProcessing(
            "first-lease",
            true,
            now.AddMinutes(1),
            now.AddSeconds(1));
        import.ClaimProcessingLease(
            "second-lease",
            now.AddMinutes(6),
            now.AddMinutes(1));
        var second = new AiOrderProcessingAttempt(
            Guid.NewGuid(),
            import.Id,
            2,
            "second-lease",
            "claude",
            "claude-haiku-4-5-20251001",
            now.AddMinutes(1));

        Assert.Equal(AiOrderProcessingAttemptOutcome.RetryableFailure, first.Outcome);
        Assert.Equal("openai", first.Provider);
        Assert.Equal(AiOrderProcessingAttemptOutcome.Processing, second.Outcome);
        Assert.Equal("claude", second.Provider);
        Assert.Equal(AiOrderImportStatus.Processing, import.Status);
    }

    [Fact]
    public async Task Provider_failure_never_calls_an_unselected_fallback()
    {
        var selected = new FakeProvider("gemini", null);
        var fallback = new FakeProvider("openai", ValidJson());

        await Assert.ThrowsAsync<AiOrderRecognitionProviderException>(() =>
            selected.RecognizeAsync(
                Request("gemini", "gemini-2.5-flash-lite"),
                default));

        Assert.Equal(1, selected.CallCount);
        Assert.Equal(0, fallback.CallCount);
    }

    private static AiOrderRecognitionStructuralValidator Validator() =>
        new(Options.Create(CreateOptions()));

    private static AiOrderRecognitionOptions CreateOptions() => new()
    {
        MaximumOutputCharacters = 1_000_000,
    };

    private static AiOrderRecognitionProviderOptions ProviderOptions(bool enabled, string apiKey)
    {
        var model = Selection();
        return new AiOrderRecognitionProviderOptions
        {
            Enabled = enabled,
            DisplayName = "OpenAI",
            ApiKey = apiKey,
            BaseUrl = "https://example.test/",
            Models =
            {
                ["gpt-5.4-nano"] = new AiOrderRecognitionModelOptions
                {
                    Enabled = true,
                    DisplayName = "Nano",
                    ApiMode = model.ApiMode,
                    ApiVersion = model.ApiVersion,
                    StructuredOutputMode = model.StructuredOutputMode,
                    SupportsImages = true,
                    SupportsPdf = true,
                    PricingVersion = model.PricingVersion,
                    InputUsdPerMillionTokens = model.InputUsdPerMillionTokens,
                    CachedInputUsdPerMillionTokens = model.CachedInputUsdPerMillionTokens,
                    OutputUsdPerMillionTokens = model.OutputUsdPerMillionTokens,
                },
            },
        };
    }

    private static AiOrderRecognitionModelSelection Selection() =>
        new(
            "openai",
            "OpenAI",
            "gpt-5.4-nano",
            "Nano",
            "Responses",
            "v1",
            "json_schema",
            true,
            true,
            "test-pricing-v1",
            1m,
            0.1m,
            6m,
            300_000,
            3_000,
            8_000);

    private static AiOrderRecognitionRequest Request(
        string provider,
        string model,
        string contentType = "image/jpeg") =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            provider,
            model,
            AiOrderRecognitionVersions.Prompt,
            AiOrderRecognitionVersions.Contract,
            "NZD",
            "en-NZ",
            "test prompt",
            """{"type":"object"}""",
            [
                new AiOrderRecognitionSource(
                    SourceId,
                    1,
                    "source-1",
                    contentType,
                    [1, 2, 3],
                    "a".PadLeft(64, 'a'),
                    0),
            ]);

    private static IOptionsMonitor<AiOrderRecognitionOptions> Monitor(string provider)
    {
        var options = CreateOptions();
        options.Providers[provider] = new AiOrderRecognitionProviderOptions
        {
            Enabled = true,
            DisplayName = provider,
            ApiKey = "test-provider-key",
            BaseUrl = "https://example.test/",
        };
        return new TestOptionsMonitor(options);
    }

    private static JsonObject ValidNode() => JsonNode.Parse(ValidJson())!.AsObject();

    private static string ValidJson() => $$"""
        {
          "contractVersion":"1.0",
          "customer":{
            "name":{{Evidence("\"Alex\"")}},
            "phone":{{Evidence("null", "missing")}},
            "email":{{Evidence("null", "missing")}},
            "company":{{Evidence("null", "missing")}},
            "addressOrFulfilmentNotes":{{Evidence("null", "missing")}}
          },
          "productGroups":[{
            "resolutionMode":"Unresolved",
            "writtenProductDescription":{{Evidence("\"Tee\"")}},
            "brand":{{Evidence("null", "missing")}},
            "supplier":{{Evidence("null", "missing")}},
            "supplierOrProductCode":{{Evidence("null", "missing")}},
            "garmentColour":{{Evidence("\"Black\"")}},
            "supplySource":{{Evidence("null", "missing")}},
            "sizeQuantityRows":[{
              "size":{{Evidence("\"M\"")}},
              "quantity":{{Evidence("2")}},
              "sourceText":"M x2",
              "warnings":[]
            }],
            "artworkIdentity":{{Evidence("null", "missing")}},
            "artworkDescription":{{Evidence("null", "missing")}},
            "printing":[],
            "sourceText":"Black Tee M x2",
            "confidence":0.9,
            "sourceRefs":[{"sourceDocumentId":"{{SourceId}}","page":1}],
            "warnings":[],
            "alternatives":[]
          }],
          "financials":{
            "orderTotal":{{MoneyEvidence("100.00")}},
            "depositPaid":{{MoneyEvidence("0.00")}},
            "writtenBalance":{{Evidence("null", "missing")}},
            "currencyEvidence":{{Evidence("\"NZD\"")}},
            "alternatives":[]
          },
          "warnings":[]
        }
        """;

    private static string Evidence(string value, string presence = "stated") =>
        $$"""{"presence":"{{presence}}","value":{{value}},"sourceText":null,"confidence":null,"sourceRefs":[]}""";

    private static string MoneyEvidence(string amount) =>
        $$"""{"presence":"stated","value":{"currency":"NZD","amount":"{{amount}}"},"sourceText":"written","confidence":1,"sourceRefs":[]}""";

    private static AiOrderProcessingAttempt RecognitionAttempt(
        DateTime now,
        Guid? importId = null,
        string leaseToken = "lease")
    {
        var attempt = new AiOrderProcessingAttempt(
            importId ?? Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            leaseToken,
            "openai",
            "gpt-5.4-nano",
            now);
        attempt.ConfigureRecognition(
            "Responses",
            "v1",
            AiOrderRecognitionVersions.Prompt,
            AiOrderRecognitionVersions.Contract,
            "json_schema",
            "price-v1",
            """{"version":"price-v1"}""",
            "[]",
            "start-key",
            "a".PadLeft(64, 'a'),
            0.1m);
        return attempt;
    }

    private static AiOrderImport NewImport() =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "1.0",
            "create-key",
            "d".PadLeft(64, 'd'),
            "standard");

    private sealed class TestHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class TestOptionsMonitor(AiOrderRecognitionOptions value) :
        IOptionsMonitor<AiOrderRecognitionOptions>
    {
        public AiOrderRecognitionOptions CurrentValue => value;
        public AiOrderRecognitionOptions Get(string? name) => value;
        public IDisposable? OnChange(
            Action<AiOrderRecognitionOptions, string?> listener) => null;
    }

    private sealed class RecordingHandler(
        HttpStatusCode status,
        string responseBody) : HttpMessageHandler
    {
        public Uri? Uri { get; private set; }
        public string Body { get; private set; } = string.Empty;
        public string? AuthorizationScheme { get; private set; }
        public string? ApiKeyHeader { get; private set; }
        public Dictionary<string, string> ResponseHeaders { get; } = [];
        public TimeSpan? RetryAfter { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Uri = request.RequestUri;
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            AuthorizationScheme = request.Headers.Authorization?.Scheme;
            ApiKeyHeader = request.Headers.TryGetValues("x-goog-api-key", out var google)
                ? google.Single()
                : request.Headers.TryGetValues("x-api-key", out var anthropic)
                    ? anthropic.Single()
                    : null;
            var response = new HttpResponseMessage(status)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json"),
            };
            foreach (var (key, value) in ResponseHeaders)
                response.Headers.TryAddWithoutValidation(key, value);
            if (RetryAfter.HasValue)
                response.Headers.RetryAfter =
                    new System.Net.Http.Headers.RetryConditionHeaderValue(RetryAfter.Value);
            return response;
        }
    }

    private sealed class FakeProvider(string providerId, string? output) :
        IAiOrderRecognitionProvider
    {
        public string ProviderId => providerId;
        public int CallCount { get; private set; }

        public Task<AiOrderRecognitionResult> RecognizeAsync(
            AiOrderRecognitionRequest request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            if (output is null)
                throw new AiOrderRecognitionProviderException(
                    "RecognitionProviderRateLimited",
                    true,
                    HttpStatusCode.TooManyRequests,
                    TimeSpan.FromSeconds(5));
            return Task.FromResult(new AiOrderRecognitionResult(
                output,
                Encoding.UTF8.GetBytes("""{"fake":true}"""),
                "fake-request",
                "completed",
                new AiOrderRecognitionUsage(10, 5, 0)));
        }
    }
}
