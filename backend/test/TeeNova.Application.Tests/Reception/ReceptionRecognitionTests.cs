using System.Text.Json;
using TeeNova.AiOrderImports.Recognition;
using Volo.Abp;

namespace TeeNova.Tests.Reception;

public class ReceptionRecognitionTests
{
    private const string Reply = """
        {"customer":"Catherina","phone":"0210000000","pickupDate":"2026-11-27","instructions":"",
         "layout":{"title":"社团队服工作单","groups":[{"heading":"活动 T 恤","presentation":"matrix","notes":"正反面印花",
         "rows":[{"colour":"白色","size":"M","quantity":8},{"colour":"黑色","size":"M","quantity":null}]}]}}
        """;

    [Fact]
    public void OpenAi_schema_requires_size_colour_and_quantity_and_includes_the_local_receipt_date()
    {
        var schema = OpenAiStrictSchema.Sanitize(ReceptionRecognition.Schema);
        var row = schema["properties"]!["layout"]!["properties"]!["groups"]!["items"]!["properties"]!["rows"]!["items"]!;
        Assert.Equal(new[] { "colour", "size", "quantity" }, row["required"]!.AsArray().Select(x => x!.GetValue<string>()));
        Assert.False(row["additionalProperties"]!.GetValue<bool>());
        Assert.Contains("2026-11-23", ReceptionRecognition.Prompt(new DateTime(2026, 11, 22, 15, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void Stores_model_layout_and_preserves_unknown_quantity()
    {
        var result = ReceptionRecognition.Validate(Reply, 24000);
        using var doc = JsonDocument.Parse(result.CanonicalJson);
        var group = doc.RootElement.GetProperty("layout").GetProperty("groups")[0];
        Assert.Equal("matrix", group.GetProperty("presentation").GetString());
        Assert.Equal(JsonValueKind.Null, group.GetProperty("rows")[1].GetProperty("quantity").ValueKind);
        Assert.Equal("0210000000", doc.RootElement.GetProperty("phone").GetString());
    }

    [Theory]
    [InlineData("183.45", "0", true)]
    [InlineData("null", "null", true)]
    [InlineData("-1", "0", false)]
    [InlineData("3.333", "1", false)]
    public void Reads_only_cent_precision_amounts(string total, string deposit, bool valid)
    {
        var json = Reply.Replace("\"customer\":", $"\"totalPrice\":{total},\"deposit\":{deposit},\"customer\":");
        if (!valid) { Assert.Throws<BusinessException>(() => ReceptionRecognition.Validate(json, 24000)); return; }
        using var doc = JsonDocument.Parse(ReceptionRecognition.Validate(json, 24000).CanonicalJson);
        Assert.Equal(total, doc.RootElement.GetProperty("totalPrice").GetRawText());
        Assert.Equal(deposit, doc.RootElement.GetProperty("deposit").GetRawText());
    }

    [Theory]
    [InlineData("\"matrix\"", "\"html\"")]
    [InlineData("\"quantity\":8", "\"quantity\":-4")]
    [InlineData("\"quantity\":8", "\"qty\":8")]
    public void Malformed_tables_trigger_the_existing_repair_path(string original, string replacement) =>
        Assert.Throws<BusinessException>(() => ReceptionRecognition.Validate(Reply.Replace(original, replacement), 24000));
}
