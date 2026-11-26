using System.Security.Cryptography;
using System.Text;
using TeeNova.AiOrderImports;
using TeeNova.Reception;

namespace TeeNova.Tests.Reception;

public class ReceptionMaterialsTests
{
    [Fact]
    public void Links_only_the_ordered_sources_and_description_used_for_recognition()
    {
        var importId = Guid.NewGuid();
        var image = Source(importId, 1, "proof.png", "image/png", "fixture");
        var pdf = Source(importId, 2, "order.pdf", "application/pdf", "fixture");
        var note = Source(importId, 3, "__reception_supplement.txt", "text/plain", "M 改为 10");
        var materials = new ReceptionMaterials(importId, [image.Id, pdf.Id], "M 改为 10");
        Assert.True(materials.MatchesUpload([image, pdf, note]));
        Assert.False((materials with { Description = "M 改为 12" }).MatchesUpload([image, pdf, note]));
        Assert.False((materials with { DocumentIds = [pdf.Id] }).MatchesUpload([image, pdf, note]));
        Assert.False((materials with { DocumentIds = [image.Id, image.Id] }).MatchesUpload([image, pdf, note]));
        Assert.False((materials with { ImportId = Guid.NewGuid() }).MatchesUpload([image, pdf, note]));
        var sheet = new ReceptionSheet(Guid.NewGuid(), "", "", null, "");
        sheet.SetMaterials(materials);
        Assert.True(materials.SameInputs(sheet.ReadMaterials()));
        image.MarkContentDeleted(DateTime.UtcNow);
        Assert.False(materials.MatchesUpload([image, pdf, note]));
        Assert.True(materials.SameInputs(sheet.ReadMaterials()));
        sheet.SetMaterials(null);
        Assert.Null(sheet.ReadMaterials());
    }

    private static AiOrderSourceDocument Source(Guid id, int order, string name, string mime, string text) =>
        new(Guid.NewGuid(), id, order, AiOrderCaptureMethod.Upload, "private", mime, text.Length,
            null, Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text))), name,
            Guid.NewGuid(), DateTime.UtcNow, null);
}
