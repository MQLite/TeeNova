using System.Text;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using TeeNova.Reception;
using ReadablePdf = UglyToad.PdfPig.PdfDocument;

namespace TeeNova.Tests.Reception;

public sealed class ArtworkPdfCompressionTests
{
    [Fact]
    public void Compresses_unfiltered_artwork_and_keeps_text_and_vector_paths_on_every_page()
    {
        var source = Artwork();
        var result = ArtworkPdfCompression.Compress(source, targetBytes: 1, default);

        Assert.NotNull(result);
        Assert.True(result.Length < source.Length / 2);
        using var pdf = ReadablePdf.Open(result);
        Assert.Equal(2, pdf.NumberOfPages);
        foreach (var page in pdf.GetPages())
        {
            Assert.Equal($"Artwork {page.Number}", page.Text);
            Assert.Single(page.Paths);
        }
    }

    [Theory]
    [InlineData("signature")]
    [InlineData("encryption")]
    public void Skips_protected_artwork(string protection)
    {
        var source = Artwork(protection);
        Assert.Null(ArtworkPdfCompression.Compress(source, 1, default));
    }

    [Fact]
    public void Keeps_the_original_catalog_metadata_stream()
    {
        var source = Artwork();
        var marker = source.AsSpan().IndexOf("3.1-701"u8);
        Assert.True(marker > 0);
        // A different toolkit identifier keeps the same PDF offsets and a valid XMP packet.
        "PrePrss"u8.CopyTo(source.AsSpan(marker));
        var result = ArtworkPdfCompression.Compress(source, 1, default);

        Assert.NotNull(result);
        using var original = PdfReader.Open(new MemoryStream(source), PdfDocumentOpenMode.Import);
        using var compressed = PdfReader.Open(new MemoryStream(result), PdfDocumentOpenMode.Import);
        Assert.Equal(original.Internals.Catalog.Elements.GetDictionary("/Metadata")!.Stream.Value,
            compressed.Internals.Catalog.Elements.GetDictionary("/Metadata")!.Stream.Value);
    }

    [Fact]
    public void Skips_invalid_input_and_honors_cancellation()
    {
        Assert.Null(ArtworkPdfCompression.Compress("%PDF-broken"u8.ToArray(), 1, default));
        Assert.Throws<OperationCanceledException>(() =>
            ArtworkPdfCompression.Compress(Artwork(), 1, new CancellationToken(true)));
    }

    private static byte[] Artwork(string? protection = null)
    {
        using var pdf = new PdfDocument();
        pdf.Options.NoCompression = true;
        pdf.Options.CompressContentStreams = false;
        for (var number = 1; number <= 2; number++)
        {
            var page = pdf.AddPage();
            var font = new PdfDictionary(pdf);
            font.Elements.SetName("/Type", "/Font");
            font.Elements.SetName("/Subtype", "/Type1");
            font.Elements.SetName("/BaseFont", "/Helvetica");
            var fonts = new PdfDictionary(pdf);
            fonts.Elements.SetObject("/F1", font);
            page.Resources.Elements.SetObject("/Font", fonts);
            var stream = new PdfDictionary(pdf);
            stream.CreateStream(Encoding.ASCII.GetBytes($"BT /F1 12 Tf 50 50 Td (Artwork {number}) Tj ET\n" +
                "0 0 100 100 re S\n%" + new string(' ', 32_768) + "\n"));
            pdf.Internals.AddObject(stream);
            page.Elements.SetReference("/Contents", stream);
        }
        if (protection == "signature")
        {
            var signature = new PdfDictionary(pdf);
            signature.Elements.SetName("/Type", "/Sig");
            signature.Elements.SetObject("/ByteRange", new PdfArray(pdf));
            pdf.Internals.AddObject(signature);
            var permissions = new PdfDictionary(pdf);
            permissions.Elements.SetReference("/DocMDP", signature);
            pdf.Internals.Catalog.Elements.SetObject("/Perms", permissions);
        }
        if (protection == "encryption") pdf.SecuritySettings.OwnerPassword = "artwork-owner";
        using var output = new MemoryStream();
        pdf.Save(output);
        return output.ToArray();
    }
}
