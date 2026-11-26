using System.Text;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Tokens;

namespace TeeNova.Reception;

internal static class ReceptionSheetPdfValidator
{
    private const double Tolerance = 0.8;

    public static GeneratedReceptionSheetPdf Verify(byte[] bytes, IReadOnlyList<ReceptionPdfPage> expected)
    {
        if (!bytes.AsSpan().StartsWith("%PDF-"u8))
            throw new ReceptionSheetPdfGenerationException("OpenAI returned an unreadable PDF file.");
        try
        {
            using var pdf = PdfDocument.Open(bytes);
            if (pdf.NumberOfPages != expected.Count)
                throw new ReceptionSheetPdfGenerationException("The PDF page count does not match the saved worksheet.");
            VerifyCatalog(pdf.Structure);
            for (var i = 0; i < expected.Count; i++)
                VerifyPage(pdf.GetPage(i + 1), expected[i]);
            return new(bytes, pdf.NumberOfPages);
        }
        catch (Exception ex) when (ex is not (ReceptionSheetPdfGenerationException or OutOfMemoryException or OperationCanceledException))
        {
            throw new ReceptionSheetPdfGenerationException("OpenAI returned an unreadable PDF file.");
        }
    }

    private static void VerifyCatalog(Structure structure)
    {
        var catalog = structure.Catalog.CatalogDictionary;
        RequireOnlyKeys(catalog, "Type", "Pages", "Info", "AF", "Names");
        if (!catalog.ContainsKey(NameToken.Create("AF")) && !catalog.ContainsKey(NameToken.Create("Names")))
            return;

        // Code Interpreter may attach a passive Content Credentials manifest to its output.
        // Admit its file structure while retaining the original downloaded bytes.
        if (!catalog.TryGet<ArrayToken>(NameToken.Create("AF"), out var associated) ||
            associated.Data is not [IndirectReferenceToken attachment] ||
            !catalog.TryGet<DictionaryToken>(NameToken.Create("Names"), out var names))
            throw UnsupportedFeatures();
        RequireOnlyKeys(names, "EmbeddedFiles");
        if (!names.TryGet<DictionaryToken>(NameToken.Create("EmbeddedFiles"), out var embedded))
            throw UnsupportedFeatures();
        RequireOnlyKeys(embedded, "Names");
        if (!embedded.TryGet<ArrayToken>(NameToken.Create("Names"), out var entries) ||
            entries.Data is not [StringToken { Data: "Content Credentials" }, IndirectReferenceToken reference] ||
            reference.Data != attachment.Data ||
            structure.GetObject(attachment.Data)?.Data is not DictionaryToken file)
            throw UnsupportedFeatures();
        RequireOnlyKeys(file, "Type", "AFRelationship", "Desc", "F", "UF", "EF", "Subtype");
        if (!NameIs(file, "Type", "Filespec") || !NameIs(file, "AFRelationship", "C2PA_Manifest") ||
            !file.TryGet<StringToken>(NameToken.Create("F"), out var filename) || filename.Data != "Content Credentials" ||
            !file.TryGet<DictionaryToken>(NameToken.Create("EF"), out var data))
            throw UnsupportedFeatures();
        RequireOnlyKeys(data, "F");
        if (!data.TryGet<IndirectReferenceToken>(NameToken.Create("F"), out var streamReference) ||
            structure.GetObject(streamReference.Data)?.Data is not StreamToken stream)
            throw UnsupportedFeatures();
        var properties = stream.StreamDictionary;
        RequireOnlyKeys(properties, "Type", "Subtype", "Length", "Filter", "DecodeParms");
        if (!NameIs(properties, "Type", "EmbeddedFile") || !NameIs(properties, "Subtype", "application/c2pa"))
            throw UnsupportedFeatures();
    }

    private static void VerifyPage(Page page, ReceptionPdfPage expected)
    {
        if (page.Rotation.Value != 0 || !A4(page.MediaBox.Bounds) || !A4(page.CropBox.Bounds))
            throw new ReceptionSheetPdfGenerationException("The PDF is not A4 portrait.");
        RequireOnlyKeys(page.Dictionary, "Type", "MediaBox", "CropBox", "Rotate", "Resources", "Parent", "Contents");
        if (page.NumberOfImages != 0)
            throw new ReceptionSheetPdfGenerationException("The PDF contains unexpected images.");

        var offset = 0;
        foreach (var text in expected.Lines)
        {
            var length = 0;
            var actual = new StringBuilder(text.Text.Length);
            while (offset < page.Letters.Count && length < text.Text.Length)
            {
                var letter = page.Letters[offset++];
                var start = letter.StartBaseLine;
                if (!Near(ReceptionSheetPdfLayout.Height - start.Y, text.Y) ||
                    (length == 0 && !Near(start.X, text.X)) ||
                    start.X < text.X - Tolerance || letter.EndBaseLine.X > text.Right + Tolerance ||
                    !Near(letter.PointSize, text.Size) || letter.RenderingMode != TextRenderingMode.Fill)
                    throw new ReceptionSheetPdfGenerationException("The PDF text does not fit the saved worksheet layout.");
                actual.Append(letter.Value);
                length += letter.Value.Length;
            }
            if (!string.Equals(actual.ToString(), text.Text, StringComparison.Ordinal))
                throw new ReceptionSheetPdfGenerationException("The PDF text does not match the saved worksheet.");
        }
        if (offset != page.Letters.Count)
            throw new ReceptionSheetPdfGenerationException("The PDF contains unexpected worksheet text.");
    }

    private static void RequireOnlyKeys(DictionaryToken dictionary, params string[] allowed)
    {
        if (dictionary.Data.Keys.Any(key => !allowed.Contains(key, StringComparer.Ordinal)))
            throw UnsupportedFeatures();
    }

    private static bool NameIs(DictionaryToken dictionary, string key, string value) =>
        dictionary.TryGet<NameToken>(NameToken.Create(key), out var actual) && actual.Data == value;

    private static ReceptionSheetPdfGenerationException UnsupportedFeatures() =>
        new("The PDF contains unsupported document features.");

    private static bool A4(PdfRectangle box) =>
        Near(box.Left, 0) && Near(box.Bottom, 0) &&
        Near(box.Width, ReceptionSheetPdfLayout.Width) && Near(box.Height, ReceptionSheetPdfLayout.Height);

    private static bool Near(double actual, double expected) => Math.Abs(actual - expected) <= Tolerance;
}
