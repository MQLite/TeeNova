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
    public void Fits_both_designs_and_age_ranges_of_a_sixty_shirt_order_on_one_page()
    {
        var colours = new[] { "Pink", "Purple", "Daisy Yellow" };
        ReceptionGarmentGroup Group(string heading, string kind, string[] sizes, int[,] counts, string area)
        {
            var rows = (from s in Enumerable.Range(0, sizes.Length)
                        from c in Enumerable.Range(0, colours.Length)
                        where counts[s, c] > 0
                        select new ReceptionSizeRow(colours[c], sizes[s], counts[s, c])).ToArray();
            return new(heading, "matrix", heading + " 说明", rows, kind, [new(area, "A4")]);
        }
        string[] adult = ["5XL", "3XL", "2XL", "XL", "L", "S"];
        string[] kids = ["12K", "8K", "6K", "4K", "2K"];
        var groups = new[] {
            Group("成人 T恤 | White 图案", "tee", adult, new[,] {{1,0,1},{2,1,2},{0,4,2},{1,3,2},{1,0,2},{0,2,0}}, "FRONT_CENTER"),
            Group("成人 T恤 | Orange 图案", "tee", adult, new[,] {{1,0,1},{2,1,3},{0,4,2},{1,3,2},{1,0,3},{0,2,0}}, "BACK_CENTER"),
            Group("儿童 T恤 | White 图案", "kidsTee", kids, new[,] {{0,0,1},{0,0,0},{0,0,1},{0,1,0},{0,1,0}}, "LEFT_CHEST"),
            Group("儿童 T恤 | Orange 图案", "kidsTee", kids, new[,] {{0,0,1},{0,0,1},{0,0,2},{0,1,0},{0,1,0}}, "RIGHT_CHEST")
        };
        var snapshot = Snapshot() with { Layout = new("Piula's Order", groups), TotalPrice = 1770, Deposit = 750 };
        var page = Assert.Single(ReceptionSheetPdfLayout.Build(snapshot));
        var bands = page.Lines.GroupBy(line => line.Y).Select(row => row.OrderBy(line => line.X)
            .Select(line => line.Text).ToArray()).ToArray();
        string[] expectedRows = [
            "5XL 1 1 1 1 — — 4", "3XL 2 2 2 3 1 1 11", "2XL — — 2 2 4 4 12",
            "XL 1 1 2 2 3 3 12", "L 1 1 2 3 — — 7", "S — — — — 2 2 4",
            "成人小计 5 5 9 11 10 10 50", "12K — — 1 1 — — 2", "8K — — — 1 — — 1",
            "6K — — 1 2 — — 3", "4K — — — — 1 1 2", "2K — — — — 1 1 2",
            "童装小计 — — 2 4 2 2 10"
        ];
        Assert.Contains(bands, row => row.Contains("#1 White") && row.Contains("#2 Orange"));
        Assert.Contains(bands, row => row.Contains("#3 White") && row.Contains("#4 Orange"));
        Assert.Equal(expectedRows, bands.Where(row => row.Length == 8 && row[0] != "图案/分组")
            .Select(row => string.Join(" ", row)));
        Assert.Contains(bands, row => row.First() == "总件数" && row.Last() == "60");
        foreach (var group in groups)
            Assert.Contains(group.Notes, string.Concat(page.Lines.Select(line => line.Text)));
        foreach (var value in new[] { "正面中央", "背面中央", "左胸", "右胸", "1,770.00", "750.00" })
            Assert.Contains(value, string.Concat(page.Lines.Select(line => line.Text)));
    }

    [Fact]
    public void Prints_saved_payment_amount_and_method_in_both_layouts()
    {
        var sheet = new ReceptionSheet(SheetId, "Customer", "", null, "");
        sheet.SetPayments([new(123.45m, "EFTPOS"), new(25, "Cash"), new(40, "Transfer")]);
        var snapshot = ReceptionSheetPdfSnapshot.FromSheet(sheet);
        var group = Snapshot().Layout!.Groups[0];
        foreach (var groups in new ReceptionGarmentGroup[][] { [group], [group, group] })
        {
            var lines = ReceptionSheetPdfLayout.Build(snapshot with { Layout = new("付款", groups) })
                .SelectMany(page => page.Lines).Select(line => line.Text).ToArray();
            Assert.Contains("实际已付款：EFTPOS · NZD 123.45", lines);
            Assert.Contains("实际已付款：Cash · NZD 25.00", lines);
            Assert.Contains("实际已付款：Transfer · NZD 40.00", lines);
        }
    }

    [Fact]
    public void Keeps_duplicate_entries_unknowns_and_explicit_zero_in_a_shared_list()
    {
        var groups = new ReceptionGarmentGroup[] {
            new("Adult shirts", "matrix", "", [new("Red", "XS", 7), new("Red", "XS", null)], null, null),
            new("Kids shirts", "rows", "", [new("Blue", "2K", 0)], null, [])
        };
        var page = Assert.Single(ReceptionSheetPdfLayout.Build(Snapshot() with { Layout = new("明细", groups) }));
        var rows = page.Lines.GroupBy(line => line.Y).Select(row => row.Select(line => line.Text).ToArray());
        Assert.Contains(rows, row => row.Contains("XS") && row.Last() == "7");
        Assert.Contains(rows, row => row.Contains("XS") && row.Last() == "待核");
        Assert.Contains(rows, row => row.First() == "童装小计" && row.Last() == "0");
        Assert.Contains(rows, row => row.First() == "总件数" && row.Last() == "待核");
    }

    [Fact]
    public void Repeats_headers_and_preserves_each_entry_when_a_mixed_list_spans_pages()
    {
        var rows = Enumerable.Range(1, 100)
            .Select(i => new ReceptionSizeRow($"Colour {i:D3}", "XL", i)).ToArray();
        var groups = new ReceptionGarmentGroup[] {
            new("Adult shirts", "rows", "", rows, "tee", []),
            new("Kids shirts", "rows", "", [new("Blue", "2K", 3)], "kidsTee", [])
        };
        var pages = ReceptionSheetPdfLayout.Build(Snapshot() with { Layout = new("订单", groups) });
        Assert.True(pages.Count > 1);
        var printed = new List<string>();
        foreach (var page in pages)
        {
            var detail = page.Lines.Where(line => line.Text.StartsWith("Colour ")).ToArray();
            if (detail.Length == 0) continue;
            var header = Assert.Single(page.Lines, line => line.Text == "衣服颜色" && line.Y < detail[0].Y);
            foreach (var line in detail)
            {
                Assert.InRange(line.Y, header.Y + 1, ReceptionSheetPdfLayout.Height - 60);
                Assert.Equal(11, line.Size);
                printed.Add(line.Text);
            }
        }
        Assert.Equal(rows.Select(row => row.Colour), printed);
        Assert.Contains(pages.SelectMany(p => p.Lines), line => line.Text == "5053");
    }

    [Fact]
    public void Fits_a_borderline_mixed_list_without_shrinking_multipage_orders()
    {
        var rows = Enumerable.Range(1, 28).Select(i => new ReceptionSizeRow($"Colour {i}", "L", 1)).ToArray();
        var groups = new ReceptionGarmentGroup[] {
            new("Adult shirts", "rows", "", rows, "tee", []),
            new("Kids shirts", "rows", "", [new("Blue", "2K", 3)], "kidsTee", [])
        };
        var page = Assert.Single(ReceptionSheetPdfLayout.Build(Snapshot() with { Layout = new("订单", groups) }));
        var colours = page.Lines.Where(line => line.Text.StartsWith("Colour ")).ToArray();
        Assert.Equal(28, colours.Length);
        Assert.All(colours, line => Assert.InRange(line.Size, 10, 11));
    }

    [Fact]
    public void Fits_a_regular_single_group_matrix_before_paginating()
    {
        var rows = (from colour in new[] { "Blue", "Red", "White", "Purple", "Pink" }
                    from size in new[] { "S", "M", "L", "XL", "2XL", "3XL" }
                    select new ReceptionSizeRow(colour, size, 1)).ToArray();
        var layout = new ReceptionPrintLayout("工作单", [new("成人", "matrix", "", rows, "tee", [])]);
        var page = Assert.Single(ReceptionSheetPdfLayout.Build(Snapshot() with { Layout = layout }));
        Assert.Contains(page.Lines, line => line.Text == "30");
    }

    [Theory]
    [InlineData("tee", "成人小计")]
    [InlineData("kidsTee", "童装小计")]
    public void Prints_the_subtotal_and_order_total_for_a_single_garment_group(string kind, string subtotal)
    {
        var group = new ReceptionGarmentGroup("短袖", "matrix", "", [new("White", "M", 4)], kind, []);
        var page = Assert.Single(ReceptionSheetPdfLayout.Build(Snapshot() with { Layout = new("工单", [group]) }));
        var rows = page.Lines.GroupBy(line => line.Y).Select(row => row.Select(line => line.Text).ToArray());
        Assert.Contains(rows, row => row.First() == subtotal && row.Last() == "4");
        Assert.Contains(rows, row => row.First() == "总件数" && row.Last() == "4");
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
