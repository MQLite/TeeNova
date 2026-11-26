using System.Diagnostics;
using System.ComponentModel;
using PdfSharp.Drawing;
using PdfSharp.Pdf.IO;

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
            if (store.Read(sheet, file) is not { Mime: "application/pdf" } original) return null;
            var png = await Pdf(original.Bytes, size, pdfRenderer, ct);
            store.CachePreview(file, size, png);
            return png;
        }
        finally { Slots.Release(); }
    }

    private static async Task<byte[]> Pdf(byte[] content, int size, string executable, CancellationToken ct)
    {
        if (Path.GetFileNameWithoutExtension(executable).Equals("pdftocairo", StringComparison.OrdinalIgnoreCase))
        {
            try { return await Render(content, size, executable, transparent: true, ct); }
            catch (Win32Exception e) when (e.NativeErrorCode is 2 or 3)
            {
                executable = Path.Combine(Path.GetDirectoryName(executable) ?? "", "pdftoppm" + Path.GetExtension(executable));
            }
        }
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
        return await Render(buffer.ToArray(), size, executable, transparent: false, ct);
    }

    private static async Task<byte[]> Render(byte[] content, int size, string executable, bool transparent, CancellationToken ct)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { "-q", "-f", "1", "-l", "1", "-singlefile", "-scale-to", size.ToString(), "-png" })
            start.ArgumentList.Add(arg);
        if (transparent) start.ArgumentList.Add("-transp");
        start.ArgumentList.Add("-");
        if (transparent) start.ArgumentList.Add("-");
        using var process = Process.Start(start) ?? throw new InvalidOperationException("PDF renderer unavailable.");
        using var limit = CancellationTokenSource.CreateLinkedTokenSource(ct);
        limit.CancelAfter(TimeSpan.FromSeconds(15));
        using var kill = limit.Token.Register(() => { try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } });
        async Task WriteInput()
        {
            using var input = process.StandardInput.BaseStream;
            await input.WriteAsync(content, limit.Token);
        }
        using var output = new MemoryStream();
        await Task.WhenAll(WriteInput(), process.StandardOutput.BaseStream.CopyToAsync(output, limit.Token),
            process.StandardError.BaseStream.CopyToAsync(Stream.Null, limit.Token), process.WaitForExitAsync(limit.Token));
        if (process.ExitCode != 0 || output.Length == 0) throw new InvalidDataException("PDF preview unavailable.");
        return output.ToArray();
    }
}
