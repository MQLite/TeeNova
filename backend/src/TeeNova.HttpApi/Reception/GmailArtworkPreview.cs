using System.Diagnostics;

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
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { "-q", "-f", "1", "-l", "1", "-singlefile", "-scale-to", size.ToString(), "-png", "-" })
            start.ArgumentList.Add(arg);
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
