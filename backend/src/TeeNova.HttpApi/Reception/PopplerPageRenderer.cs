using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;

namespace TeeNova.Reception;

internal static class PopplerPageRenderer
{
    public static async Task<byte[]> Png(byte[] pdf, int page, int size, string executable, CancellationToken ct,
        Func<byte[]>? artworkOnCheckerboard = null)
    {
        if (Path.GetFileNameWithoutExtension(executable).Equals("pdftocairo", StringComparison.OrdinalIgnoreCase))
        {
            try { return await Render(pdf, page, size, executable, cairo: true, transparent: artworkOnCheckerboard != null, ct); }
            catch (Win32Exception error) when (error.NativeErrorCode is 2 or 3)
            {
                executable = Path.Combine(Path.GetDirectoryName(executable) ?? "", "pdftoppm" + Path.GetExtension(executable));
            }
        }
        return await Render(artworkOnCheckerboard?.Invoke() ?? pdf, page, size, executable, cairo: false, transparent: false, ct);
    }

    private static async Task<byte[]> Render(byte[] content, int page, int size, string executable, bool cairo, bool transparent, CancellationToken ct)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        var pageNumber = page.ToString(CultureInfo.InvariantCulture);
        foreach (var arg in new[] { "-q", "-f", pageNumber, "-l", pageNumber, "-singlefile", "-scale-to", size.ToString(CultureInfo.InvariantCulture), "-png" })
            start.ArgumentList.Add(arg);
        if (transparent) start.ArgumentList.Add("-transp");
        start.ArgumentList.Add("-");
        if (cairo) start.ArgumentList.Add("-");
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
