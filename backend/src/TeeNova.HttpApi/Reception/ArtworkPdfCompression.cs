using PdfSharp.Pdf;
using PdfSharp.Pdf.Advanced;
using PdfSharp.Pdf.IO;

namespace TeeNova.Reception;

internal static class ArtworkPdfCompression
{
    public static byte[]? Compress(byte[] source, int targetBytes, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (source.Length <= targetBytes || !source.AsSpan().StartsWith("%PDF-"u8))
            return null;

        try
        {
            using var input = new MemoryStream(source, writable: false);
            using var pdf = PdfReader.Open(input, PdfDocumentOpenMode.Modify);
            var catalog = pdf.Internals.Catalog.Elements;
            if (pdf.SecuritySettings.IsEncrypted || pdf.PageCount == 0 ||
                catalog.ContainsKey("/Perms") || catalog.ContainsKey("/AcroForm"))
                return null;

            var changed = false;
            foreach (var obj in pdf.Internals.GetAllObjects())
            {
                ct.ThrowIfCancellationRequested();
                if (obj is not PdfDictionary dictionary) continue;
                var elements = dictionary.Elements;
                var type = elements.GetName("/Type");
                if (type is "/Sig" or "/DocTimeStamp" || elements.ContainsKey("/ByteRange"))
                    return null;

                // Preserve existing encodings, including JPEG/JPX, and leave metadata and
                // external streams in the form required by the document.
                if (dictionary.Stream is not { } stream || type is "/Metadata" or "/XRef" or "/ObjStm" ||
                    elements.ContainsKey("/Filter") || elements.ContainsKey("/F") ||
                    elements.ContainsKey("/DecodeParms"))
                    continue;
                stream.Zip();
                changed = true;
            }

            if (!changed) return null;
            var originalMetadata = catalog.GetReference("/Metadata");
            if (originalMetadata == null && catalog.ContainsKey("/Metadata")) return null;
            using var output = new MemoryStream();
            pdf.Save(output, closeStream: false);
            ct.ThrowIfCancellationRequested();
            if (output.Length >= source.Length) return null;
            if (originalMetadata != null && !RestoreMetadata(pdf, output, originalMetadata))
                return null;
            return output.ToArray();
        }
        catch (Exception e) when (e is not OperationCanceledException and not OutOfMemoryException)
        {
            // Unsupported PDFs can still be kept unchanged if the rest of the batch fits.
            return null;
        }
    }

    private static bool RestoreMetadata(PdfDocument pdf, MemoryStream output, PdfReference original)
    {
        // PDFsharp 6 writes the existing XMP object, then points the catalog to a newly
        // generated packet. Restore the original reference while keeping all xref offsets.
        if (original.Value is not PdfDictionary { Stream: not null } ||
            pdf.Internals.GetObject(original.ObjectID) != original.Value)
            return false;
        var catalog = pdf.Internals.Catalog;
        using var serialized = new MemoryStream();
        pdf.Internals.WriteObject(serialized, catalog);
        var offset = checked((int)catalog.Reference!.Position);
        var saved = output.GetBuffer().AsSpan(offset, checked((int)serialized.Length));
        if (!saved.SequenceEqual(serialized.GetBuffer().AsSpan(0, saved.Length))) return false;

        catalog.Elements.SetReference("/Metadata", original);
        serialized.SetLength(0);
        pdf.Internals.WriteObject(serialized, catalog);
        if (serialized.Length > saved.Length) return false;
        var restored = serialized.GetBuffer().AsSpan(0, (int)serialized.Length);
        restored.CopyTo(saved);
        saved[restored.Length..].Fill((byte)' ');
        return true;
    }
}
