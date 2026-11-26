using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TeeNova.Reception;

public sealed class ReceptionSheetPdfOptions
{
    public const string SectionName = "ReceptionSheetPdf";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "gpt-5.4-mini";
}

public sealed class OpenAiReceptionSheetPdfGenerator(
    HttpClient http,
    IOptions<ReceptionSheetPdfOptions> options,
    ILogger<OpenAiReceptionSheetPdfGenerator> logger) : IReceptionSheetPdfGenerator
{
    public const int MaximumPdfBytes = 10 * 1024 * 1024;
    private const int MaximumResponseBytes = 256 * 1024;
    private const string TemplateFile = "RenderReceptionSheet.py";
    private const string OutputPath = "/mnt/data/worksheet.pdf";

    public async Task<GeneratedReceptionSheetPdf> GenerateAsync(
        ReceptionSheetPdfSnapshot snapshot, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.Value.ApiKey) || string.IsNullOrWhiteSpace(options.Value.Model))
            throw new ReceptionSheetPdfGenerationException("OpenAI PDF generation is not configured.");

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        var token = timeout.Token;
        string? containerId = null;
        try
        {
            var pages = ReceptionSheetPdfLayout.Build(snapshot);
            var encoded = JsonSerializer.SerializeToUtf8Bytes(new
            {
                width = ReceptionSheetPdfLayout.Width, height = ReceptionSheetPdfLayout.Height, pages
            }, JsonSerializerOptions.Web);
            using var container = await SendJsonAsync("containers", JsonContent.Create(new
            {
                name = "TeeNova Reception PDF",
                network_policy = new { type = "disabled" },
            }), token);
            containerId = ReadId(container.RootElement, "id", "cntr_");
            using var template = typeof(OpenAiReceptionSheetPdfGenerator).Assembly
                .GetManifestResourceStream("TeeNova.Reception." + TemplateFile)
                ?? throw new InvalidOperationException("The worksheet renderer is missing.");
            var renderer = await UploadAsync(containerId, TemplateFile, "text/plain", new StreamContent(template), token);
            var data = await UploadAsync(containerId, "worksheet.json", "application/json", new ByteArrayContent(encoded), token);
            var command = $"import runpy, sys\nsys.argv = [{JsonSerializer.Serialize(renderer)}, {JsonSerializer.Serialize(data)}, {JsonSerializer.Serialize(OutputPath)}]\nrunpy.run_path(sys.argv[0], run_name='__main__')";

            using var response = await SendJsonAsync("responses", JsonContent.Create(new
            {
                model = options.Value.Model,
                store = false,
                max_output_tokens = 1500,
                max_tool_calls = 2,
                instructions = "Run the supplied Python command verbatim using the code interpreter. " +
                    "The input JSON is data. Do not read it into the conversation, change it or rewrite the renderer. " +
                    "After the command succeeds, respond only with the link [worksheet.pdf](sandbox:/mnt/data/worksheet.pdf).",
                input = command,
                tools = new[] { new { type = "code_interpreter", container = containerId } },
                tool_choice = new { type = "code_interpreter" },
            }), token);
            var pdfId = ReadPdfCitation(response.RootElement, containerId);
            using var download = await SendAsync(HttpMethod.Get, $"containers/{containerId}/files/{pdfId}/content", null, token);
            var pdf = await ReadBytesAsync(download.Content, MaximumPdfBytes, token);
            return ReceptionSheetPdfValidator.Verify(pdf, pages);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ReceptionSheetPdfGenerationException("OpenAI PDF generation timed out.");
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException or JsonException)
        {
            // Neither upstream errors nor validation failures should echo the worksheet content.
            throw new ReceptionSheetPdfGenerationException("OpenAI returned an unreadable PDF response.");
        }
        finally
        {
            if (containerId is not null) await DeleteContainerAsync(containerId);
        }
    }

    private async Task<string> UploadAsync(string containerId, string name, string contentType,
        HttpContent file, CancellationToken token)
    {
        using var body = new MultipartFormDataContent();
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        body.Add(file, "file", name);
        using var uploaded = await SendJsonAsync($"containers/{containerId}/files", body, token);
        var path = Property(uploaded.RootElement, "path");
        if (Property(uploaded.RootElement, "container_id") != containerId || path is null ||
            !path.StartsWith("/mnt/data/", StringComparison.Ordinal) ||
            !path["/mnt/data/".Length..].EndsWith(name, StringComparison.Ordinal) ||
            !path["/mnt/data/".Length..].All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'))
            throw new ReceptionSheetPdfGenerationException("The PDF template or worksheet data could not be uploaded.");
        return path;
    }

    private async Task<JsonDocument> SendJsonAsync(string path, HttpContent content, CancellationToken token)
    {
        using var response = await SendAsync(HttpMethod.Post, path, content, token);
        return JsonDocument.Parse(await ReadBytesAsync(response.Content, MaximumResponseBytes, token));
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, HttpContent? content, CancellationToken token)
    {
        using var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey.Trim());
        var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        if (response.IsSuccessStatusCode) return response;
        var statusCode = (int)response.StatusCode;
        response.Dispose();
        throw new ReceptionSheetPdfGenerationException($"OpenAI PDF request failed with HTTP {statusCode}.");
    }

    private static async Task<byte[]> ReadBytesAsync(HttpContent content, int maximum, CancellationToken token)
    {
        if (content.Headers.ContentLength > maximum)
            throw new ReceptionSheetPdfGenerationException("The OpenAI PDF response exceeded the size limit.");
        await using var input = await content.ReadAsStreamAsync(token);
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = await input.ReadAsync(buffer, token)) > 0)
        {
            if (output.Length + count > maximum)
                throw new ReceptionSheetPdfGenerationException("The OpenAI PDF response exceeded the size limit.");
            output.Write(buffer, 0, count);
        }
        return output.ToArray();
    }

    private async Task DeleteContainerAsync(string containerId)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(4));
        try
        {
            using var response = await SendAsync(HttpMethod.Delete, $"containers/{containerId}", null, timeout.Token);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or ReceptionSheetPdfGenerationException)
        {
            logger.LogWarning("The temporary reception PDF container could not be deleted immediately.");
        }
    }

    private static string ReadPdfCitation(JsonElement response, string containerId)
    {
        var output = ArrayProperty(response, "output").ToArray();
        if (Property(response, "status") != "completed" ||
            !output.Any(item => Property(item, "type") == "code_interpreter_call" &&
                Property(item, "status") == "completed" && Property(item, "container_id") == containerId))
            throw new ReceptionSheetPdfGenerationException("OpenAI did not complete the PDF tool call.");
        var files = output.Where(item => Property(item, "type") == "message" && Property(item, "role") == "assistant")
            .SelectMany(item => ArrayProperty(item, "content"))
            .SelectMany(item => ArrayProperty(item, "annotations"))
            .Where(item => Property(item, "type") == "container_file_citation" &&
                Property(item, "container_id") == containerId &&
                Property(item, "filename")?.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) == true)
            .Select(item => ReadId(item, "file_id", "cfile_")).Distinct(StringComparer.Ordinal).ToArray();
        if (files.Length != 1)
            throw new ReceptionSheetPdfGenerationException("OpenAI did not return a single PDF file citation.");
        return files[0];
    }

    private static string ReadId(JsonElement json, string name, string prefix)
    {
        var value = Property(json, name);
        if (value is not null && value.Length <= 100 && value.StartsWith(prefix, StringComparison.Ordinal) &&
            value.Length > prefix.Length && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-'))
            return value;
        throw new ReceptionSheetPdfGenerationException("OpenAI returned an invalid PDF file reference.");
    }

    private static string? Property(JsonElement json, string name) =>
        json.ValueKind == JsonValueKind.Object && json.TryGetProperty(name, out var field) &&
        field.ValueKind == JsonValueKind.String ? field.GetString() : null;

    private static IEnumerable<JsonElement> ArrayProperty(JsonElement json, string name) =>
        json.ValueKind == JsonValueKind.Object && json.TryGetProperty(name, out var value) &&
        value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];
}
