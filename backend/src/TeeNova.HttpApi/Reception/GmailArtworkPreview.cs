using PdfSharp.Drawing;
using PdfSharp.Pdf.IO;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;

namespace TeeNova.Reception;

internal static class GmailArtworkPreview
{
    private static readonly SemaphoreSlim Slots = new(2);

    public static async Task<byte[]?> Get(GmailArtworkStore store, Guid sheet, Guid file, int size,
        string pdfRenderer, CancellationToken ct)
    {
        if (store.CachedPreview(sheet, file, size) is { } cached) return cached;
        await Slots.WaitAsync(ct);
        try
        {
            if (store.CachedPreview(sheet, file, size) is { } ready) return ready;
            if (store.Read(sheet, file) is not { } original) return null;
            var png = original.Mime switch
            {
                "application/pdf" => await Pdf(original.Bytes, size, pdfRenderer, ct),
                "image/jpeg" or "image/png" or "image/webp" => await ImageThumbnail(original.Bytes, size, ct),
                _ => null
            };
            if (png == null) return null;
            store.CachePreview(file, size, png);
            return png;
        }
        finally { Slots.Release(); }
    }

    private static async Task<byte[]?> ImageThumbnail(byte[] content, int size, CancellationToken ct)
    {
        using var input = new MemoryStream(content, writable: false);
        var options = new DecoderOptions { MaxFrames = 1, TargetSize = new Size(size, size) };
        try
        {
            var info = await Image.IdentifyAsync(new DecoderOptions { MaxFrames = 1, SkipMetadata = true }, input, ct);
            if ((long)info.Width * info.Height > 30_000_000) return null;
            input.Position = 0;
            using var image = await Image.LoadAsync(options, input, ct);
            image.Mutate(x => x.AutoOrient());
            if (Math.Max(image.Width, image.Height) > size)
                image.Mutate(x => x.Resize(new ResizeOptions { Size = new(size, size), Mode = ResizeMode.Max }));
            using var output = new MemoryStream();
            await image.SaveAsync(output, new PngEncoder { SkipMetadata = true }, ct);
            return output.ToArray();
        }
        catch (Exception e) when (e is ImageFormatException or NotSupportedException)
        {
            return null;
        }
    }

    private static Task<byte[]> Pdf(byte[] content, int size, string executable, CancellationToken ct) =>
        PopplerPageRenderer.Png(content, 1, size, executable, ct, () => OnCheckerboard(content, size));

    private static byte[] OnCheckerboard(byte[] content, int size)
    {
        // Older Poppler installations flatten to white. Place the same grid behind the artwork
        // on a temporary preview page so white ink stays white and unpainted areas show the grid.
        using var input = new MemoryStream(content);
        using var source = PdfReader.Open(input, PdfDocumentOpenMode.Import);
        using var preview = new PdfSharp.Pdf.PdfDocument();
        var page = preview.AddPage(source.Pages[0]);
        using (var graphics = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Prepend))
        {
            var width = page.Width.Point;
            var height = page.Height.Point;
            var unit = 8 * Math.Max(width, height) / size;
            if (!double.IsFinite(unit) || unit <= 0) throw new InvalidDataException("Invalid PDF page dimensions.");
            var gray = new XSolidBrush(XColor.FromArgb(225, 228, 231));
            for (var y = 0; y < (int)Math.Ceiling(height / unit); y++)
                for (var x = y % 2; x < (int)Math.Ceiling(width / unit); x += 2)
                    graphics.DrawRectangle(gray, x * unit, y * unit, unit, unit);
        }
        using var buffer = new MemoryStream();
        preview.Save(buffer);
        return buffer.ToArray();
    }
}
