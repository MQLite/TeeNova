using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PdfSharp.Pdf;
using TeeNova.AiOrderImports;
using TeeNova.AiOrderImports.Recognition;
using Volo.Abp;

namespace TeeNova.Tests.Reception;

public sealed class ReceptionBatchTests
{
    [Theory]
    [InlineData(',')]
    [InlineData(';')]
    [InlineData('\t')]
    public void Quoted_csv_preserves_columns_and_the_original_record_start_lines(char separator)
    {
        var text = $"\ufeffColour{separator}Size{separator}Quantity\r\n\"Black{separator}White\"{separator}\"M\"{separator}8\r\n\"Navy\r\nblue\"{separator}L{separator}4\r\n\r\n\"\"{separator}\"XL\"\"tall\"{separator}2\r\n";
        var rows = ReceptionDelimitedText.ParseCsv(text);
        Assert.Equal(new[] { 1, 2, 3, 6 }, rows.Select(x => x.Line));
        Assert.Equal(new[] { "Colour", "Size", "Quantity" }, rows[0].Cells);
        Assert.Equal(new[] { $"Black{separator}White", "M", "8" }, rows[1].Cells);
        Assert.Equal(new[] { "Navy\nblue", "L", "4" }, rows[2].Cells);
        Assert.Equal(new[] { "", "XL\"tall", "2" }, rows[3].Cells);
    }

    [Theory]
    [InlineData("Colour,Size,Quantity\nWhite,M")]
    [InlineData("Colour,Size,Quantity\n\"White,M,8")]
    [InlineData("Colour,Size,Quantity\n\"White\"broken,M,8")]
    public void Invalid_csv_rejects_the_source_before_recognition(string invalid)
    {
        var exception = Assert.Throws<BusinessException>(() => ReceptionDelimitedText.ParseCsv(invalid));
        Assert.Equal(AiOrderImportErrorCodes.InvalidSourceContent, exception.Code);
        Assert.Contains("2", exception.Message);
    }

    [Fact]
    public void Limit_endpoint_values_intersect_upload_and_recognition_budgets()
    {
        var limits = ReceptionBatchLimits.FromOptions(new() { MaxFilesPerImport = 8, MaxPdfPages = 17 },
            new() { MaximumSources = 5, MaximumSourceBytes = 12_000_000, MaximumRequestPayloadBytes = 10_000_000 });
        Assert.Equal(5, limits.MaxFiles);
        Assert.Equal(10_000_000, limits.MaxFileBytes);
        Assert.Equal(10_000_000, limits.MaxTotalBytes);
        Assert.Equal(17, limits.MaxPdfPages);
        Assert.Equal(8_000, limits.MaxDescriptionBytes);
        Assert.Equal(60_000, limits.MaxTextBytes);
    }

    [Fact]
    public async Task Encrypted_pdf_is_rejected_even_if_it_can_open_with_no_user_password()
    {
        using var pdf = new PdfDocument();
        pdf.AddPage();
        pdf.SecuritySettings.OwnerPassword = "test-fixture-owner";
        using var content = new MemoryStream();
        pdf.Save(content, closeStream: false);
        content.Position = 0;
        var validator = new AiOrderSourceFileValidator(Options.Create(new AiOrderIntakeOptions()));
        var format = validator.ValidateDeclaration("protected.pdf", "application/pdf", content.Length, allowReceptionCsv: true);

        var error = await Assert.ThrowsAsync<BusinessException>(() => validator.InspectAsync(content, format, default));
        Assert.Equal(AiOrderImportErrorCodes.InvalidSourceContent, error.Code);
        Assert.Contains("unencrypted PDF", error.Message);
    }

    [Fact]
    public void Batch_response_keeps_provenance_and_rejects_bad_ids_and_coordinates()
    {
        var table = Guid.NewGuid();
        var pdf = Guid.NewGuid();
        var supplement = Guid.NewGuid();
        var descriptors = new AiOrderRecognitionSourceDescriptor[]
        {
            new(table, 1, "text/csv", 10, "csv", 0, null),
            new(pdf, 2, "application/pdf", 10, "pdf", 0, 2),
            new(supplement, 3, "text/plain", 10, "staff", 0, null, IsSupplement: true),
        };
        var prepared = new AiOrderRecognitionSource[]
        {
            new(table, 1, "csv", "text/plain", [], "csv", 0, ReferenceLines: new HashSet<int> { 1, 2, 4 }),
            new(pdf, 2, "pdf", "application/pdf", [], "pdf", 0),
            new(supplement, 3, "staff", "text/plain", [], "staff", 0, true, new HashSet<int> { 1 }),
        };
        string Draft(Guid firstDocument, int line, int page) => $$"""
            {"customer":"Customer A","phone":"","pickupDate":null,"instructions":"确认后制作",
             "layout":{"title":"接待工作单","groups":[]},"totalPrice":null,"deposit":null,
             "sourceNotes":[{"kind":"correction","field":"白色 M","message":"补充描述改为 10 件",
                "previousValue":"8","suggestedValue":"10","references":[
                  {"documentId":"{{firstDocument}}","page":null,"line":{{line}},"quote":"White,M,8"},
                  {"documentId":"{{supplement}}","page":null,"line":1,"quote":"M 改为 10"}]},
               {"kind":"multipleCustomers","field":"客户","message":"该页是另一客户的订单",
                "previousValue":null,"suggestedValue":null,"references":[
                  {"documentId":"{{pdf}}","page":{{page}},"line":null,"quote":"Customer B"}]}]}
            """;

        var verified = ReceptionRecognition.Validate(Draft(table, 4, 2), 5000, descriptors, prepared);
        using var canonical = JsonDocument.Parse(verified.CanonicalJson);
        var note = canonical.RootElement.GetProperty("sourceNotes")[0];
        Assert.Equal("10", note.GetProperty("suggestedValue").GetString());
        Assert.Equal(table, note.GetProperty("references")[0].GetProperty("documentId").GetGuid());
        Assert.Throws<BusinessException>(() => ReceptionRecognition.Validate(Draft(Guid.NewGuid(), 4, 2), 5000, descriptors, prepared));
        Assert.Throws<BusinessException>(() => ReceptionRecognition.Validate(Draft(table, 3, 2), 5000, descriptors, prepared));
        Assert.Throws<BusinessException>(() => ReceptionRecognition.Validate(Draft(table, 4, 3), 5000, descriptors, prepared));
    }

    [Fact]
    public async Task OpenAi_receives_one_ordered_batch_with_pdf_image_and_labeled_text()
    {
        var csv = Guid.NewGuid();
        var image = Guid.NewGuid();
        var pdf = Guid.NewGuid();
        var supplement = Guid.NewGuid();
        var copy = Guid.NewGuid();
        var services = new ServiceCollection();
        services.Configure<AiOrderRecognitionOptions>(options => options.Providers["openai"] = new()
        {
            Enabled = true, BaseUrl = "https://openai.example.test", ApiKey = "test-key",
        });
        using var settings = services.BuildServiceProvider();
        using var handler = new CaptureRecognitionRequest();
        var provider = new OpenAiOrderRecognitionProvider(new RecognitionClientFactory(handler),
            settings.GetRequiredService<IOptionsMonitor<AiOrderRecognitionOptions>>());
        await provider.RecognizeAsync(new(Guid.NewGuid(), Guid.NewGuid(), "openai", "fixture-model", ReceptionRecognition.BatchPromptVersion,
            ReceptionRecognition.BatchContract, "NZD", "en-NZ", "Read all sources", ReceptionRecognition.BatchSchema,
            [
                new(csv, 1, "table", "text/plain", "{\"line\":4,\"cells\":[\"White\",\"M\",\"8\"]}"u8.ToArray(), "table", 0),
                new(image, 2, "image", "image/jpeg", [1, 2, 3], "image", 0),
                new(pdf, 3, "two-pages", "application/pdf", "%PDF-fixture"u8.ToArray(), "pdf", 0),
                new(supplement, 4, "staff", "text/plain", "[{\"line\":1,\"text\":\"M changes to 10\"}]"u8.ToArray(), "staff", 0, true),
                new(copy, 5, "copy", "image/jpeg", [1, 2, 3], "image", 0),
            ]), default);

        Assert.Equal("Read all sources", handler.Body!["instructions"]!.GetValue<string>());
        var parts = handler.Body["input"]![0]!["content"]!.AsArray();
        Assert.Equal(new[] { "input_text", "input_text", "input_text", "input_image", "input_text", "input_file", "input_text", "input_text", "input_text" },
            parts.Select(part => part!["type"]!.GetValue<string>()));
        Assert.Contains(csv.ToString(), parts[0]!["text"]!.GetValue<string>());
        Assert.Contains("\"line\":4", parts[1]!["text"]!.GetValue<string>());
        Assert.Contains(pdf.ToString(), parts[4]!["text"]!.GetValue<string>());
        Assert.StartsWith("data:application/pdf;base64,", parts[5]!["file_data"]!.GetValue<string>());
        Assert.Contains(supplement.ToString(), parts[6]!["text"]!.GetValue<string>());
        Assert.Contains("supplemental description", parts[6]!["text"]!.GetValue<string>());
        Assert.Contains("M changes to 10", parts[7]!["text"]!.GetValue<string>());
        Assert.Contains(image.ToString(), parts[8]!["text"]!.GetValue<string>());
        Assert.Contains(copy.ToString(), parts[8]!["text"]!.GetValue<string>());
    }

    private sealed class RecognitionClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class CaptureRecognitionRequest : HttpMessageHandler
    {
        public JsonNode? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct));
            return new(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"id":"fixture","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}]}"""),
            };
        }
    }
}
