using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TeeNova.Reception;
using Xunit;

namespace TeeNova.Application.Tests.Reception;

public sealed class ReceptionSheetPdfTests
{
    private static readonly Guid SheetId = Guid.Parse("a0db9ab3-a706-4d52-898a-b4cadaecff9a");
    private static readonly string FixturePath = Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf");

    [Fact]
    public async Task Downloads_the_cited_pdf_from_its_container_and_returns_the_verified_file()
    {
        var pdf = await File.ReadAllBytesAsync(FixturePath);
        using var responses = new OpenAiHandler(FileCitation, pdf);
        using var http = NewClient(responses);

        var result = await Generator(http).GenerateAsync(Snapshot(), CancellationToken.None);

        Assert.Equal(1, result.PageCount);
        Assert.Equal(pdf, result.Bytes);
        Assert.Equal("/v1/containers/cntr_test/files/cfile_pdf/content", responses.DownloadPath);
        Assert.True(responses.Deleted);
    }

    [Fact]
    public async Task Rejects_a_pdf_whose_table_row_differs_from_the_saved_version()
    {
        var pdf = await File.ReadAllBytesAsync(FixturePath);
        using var responses = new OpenAiHandler(FileCitation, pdf);
        using var http = NewClient(responses);

        await Assert.ThrowsAsync<ReceptionSheetPdfGenerationException>(
            () => Generator(http).GenerateAsync(Snapshot(quantity: 37), CancellationToken.None));
    }

    [Fact]
    public void Rejects_letter_width_even_when_the_saved_text_is_unchanged()
    {
        var pdf = File.ReadAllBytes(FixturePath);
        var widthOffset = pdf.AsSpan().IndexOf("595.2756"u8);
        Assert.True(widthOffset >= 0);
        "612.0000"u8.CopyTo(pdf.AsSpan(widthOffset));

        var failure = Assert.Throws<ReceptionSheetPdfGenerationException>(
            () => ReceptionSheetPdfValidator.Verify(pdf, ReceptionSheetPdfLayout.Build(Snapshot())));

        Assert.Contains("A4", failure.Message);
    }

    [Fact]
    public void Repeats_table_headings_and_keeps_every_row_in_a_multipage_layout()
    {
        var snapshot = Snapshot();
        var rows = Enumerable.Range(1, 60).Select(i => new ReceptionSizeRow($"藏青色 {i:D2}", "XL", i)).ToArray();
        var group = snapshot.Layout!.Groups[0] with { Rows = rows };
        var pages = ReceptionSheetPdfLayout.Build(snapshot with { Layout = snapshot.Layout with { Groups = [group] } });

        Assert.True(pages.Count > 1);
        var colours = pages.SelectMany(page => page.Lines)
            .Where(line => line.Text.StartsWith("藏青色 ", StringComparison.Ordinal)).ToArray();
        Assert.Equal(Enumerable.Range(1, 60).Select(i => $"藏青色 {i:D2}"), colours.Select(line => line.Text));
        foreach (var (page, index) in pages.Select((page, index) => (page, index)))
        {
            Assert.Contains(page.Lines, line => line.Text == $"第 {index + 1} 页 / 共 {pages.Count} 页");
            Assert.Contains(page.Lines, line => line.Text == "衣服颜色");
            Assert.Contains(page.Lines, line => line.Text == "尺码");
            Assert.All(page.Lines.Where(line => line.Text.StartsWith("藏青色 ", StringComparison.Ordinal)), line =>
            {
                Assert.Equal(11, line.Size);
                Assert.Contains(page.Rules, rule => !rule.Filled && rule.Y > line.Y + 3 && rule.Y < line.Y + 9);
            });
        }
    }

    [Fact]
    public async Task Rejects_a_successful_response_without_a_pdf_citation()
    {
        using var responses = new OpenAiHandler("""{"status":"completed","output":[]}""");
        using var http = NewClient(responses);

        await Assert.ThrowsAsync<ReceptionSheetPdfGenerationException>(
            () => Generator(http).GenerateAsync(Snapshot(), CancellationToken.None));

        Assert.Null(responses.DownloadPath);
        Assert.True(responses.Deleted);
    }

    [Fact]
    public async Task Wraps_openai_timeout_as_retryable_generation_failure()
    {
        using var responses = new OpenAiHandler(null);
        using var http = NewClient(responses);

        await Assert.ThrowsAsync<ReceptionSheetPdfGenerationException>(
            () => Generator(http).GenerateAsync(Snapshot(), CancellationToken.None));

        Assert.True(responses.Deleted);
    }

    [Fact]
    public async Task Keeps_private_source_originals_out_of_the_generation_payload()
    {
        using var responses = new OpenAiHandler("""{"status":"completed","output":[]}""");
        using var http = NewClient(responses);

        await Assert.ThrowsAsync<ReceptionSheetPdfGenerationException>(
            () => Generator(http).GenerateAsync(Snapshot(), CancellationToken.None));

        Assert.Contains("MKT-333", Assert.IsType<string>(responses.UploadedData));
        Assert.DoesNotContain("Never upload this handwriting", responses.UploadedData);
        Assert.DoesNotContain("Customers are data", Assert.IsType<string>(responses.ResponseRequest));
        Assert.Contains("code_interpreter", responses.ResponseRequest);
        Assert.Contains("\"store\":false", responses.ResponseRequest);
    }

    internal static ReceptionSheetPdfSnapshot Snapshot(int quantity = 3)
    {
        var layout = new ReceptionPrintLayout("团体印花工作单", [
            new ReceptionGarmentGroup("棉质短袖", "rows", "背面印花请用白墨。", [
                new ReceptionSizeRow("黑色", "M", quantity),
                new ReceptionSizeRow("白色", "XL", 0),
                new ReceptionSizeRow("藏青", "3XL", null),
            ], "tee", [new ReceptionPrintSpec("BACK_CENTER", "A4")])
        ]);
        var sheet = new ReceptionSheet(SheetId, "Customers are data 李青", "021 345 987",
            new DateOnly(2026, 12, 3), "袋上标记 MKT-333。");
        sheet.CreationTime = new DateTime(2026, 11, 26, 15, 0, 0, DateTimeKind.Utc);
        sheet.Revise(sheet.Customer, sheet.Phone, sheet.PickupDate, sheet.Instructions, JsonSerializer.Serialize(layout),
            520.88m, 30m, "Never upload this handwriting", "NZD 418.50（印花另计）");
        sheet.SetSourcePhoto(new ReceptionPhotoSource(Guid.NewGuid(), Guid.NewGuid()));
        return ReceptionSheetPdfSnapshot.FromSheet(sheet);
    }

    private const string FileCitation = """
        {"status":"completed","output":[
          {"type":"code_interpreter_call","container_id":"cntr_test","status":"completed"},
          {"type":"message","role":"assistant","status":"completed","content":[
            {"type":"output_text","text":"[worksheet](sandbox:/mnt/data/worksheet.pdf)","annotations":[
              {"type":"container_file_citation","container_id":"cntr_test","file_id":"cfile_pdf","filename":"worksheet.pdf","start_index":0,"end_index":8}
            ]}
          ]}
        ]}
        """;

    private static HttpClient NewClient(HttpMessageHandler handler) => new(handler)
    {
        BaseAddress = new Uri("https://api.openai.com/v1/"),
    };

    private static OpenAiReceptionSheetPdfGenerator Generator(HttpClient client) =>
        new(client, Options.Create(new ReceptionSheetPdfOptions { ApiKey = "test-only" }),
            NullLogger<OpenAiReceptionSheetPdfGenerator>.Instance);

    private sealed class OpenAiHandler(string? response, byte[]? pdf = null) : HttpMessageHandler
    {
        public string? DownloadPath { get; private set; }
        public string? UploadedData { get; private set; }
        public string? ResponseRequest { get; private set; }
        public bool Deleted { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Assert.Equal("test-only", request.Headers.Authorization?.Parameter);
            var path = request.RequestUri!.AbsolutePath;
            if (request.Method == HttpMethod.Delete)
            {
                Assert.Equal("/v1/containers/cntr_test", path);
                Deleted = true;
                return Json("""{"id":"cntr_test","object":"container.deleted","deleted":true}""");
            }
            if (request.Method == HttpMethod.Get)
            {
                DownloadPath = path;
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(pdf!) };
            }
            if (path == "/v1/containers")
                return Json("""{"id":"cntr_test","object":"container","status":"running","name":"TeeNova Reception PDF"}""");
            if (path == "/v1/containers/cntr_test/files")
            {
                var part = Assert.Single(Assert.IsType<MultipartFormDataContent>(request.Content));
                var name = part.Headers.ContentDisposition!.FileName!.Trim('"');
                if (name == "worksheet.json")
                    UploadedData = await part.ReadAsStringAsync(token);
                return Json(JsonSerializer.Serialize(new
                {
                    id = name == "worksheet.json" ? "cfile_data" : "cfile_template",
                    @object = "container.file",
                    container_id = "cntr_test",
                    path = "/mnt/data/input-" + name,
                    source = "user"
                }));
            }
            Assert.Equal("/v1/responses", path);
            ResponseRequest = await request.Content!.ReadAsStringAsync(token);
            if (response is null) throw new TaskCanceledException("Simulated upstream timeout");
            return Json(response);
        }

        private static HttpResponseMessage Json(string content) =>
            new(HttpStatusCode.OK) { Content = new StringContent(content, System.Text.Encoding.UTF8, "application/json") };
    }
}
