using Microsoft.AspNetCore.Http;
using PdfSharp.Pdf.IO;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;

namespace TeeNova.Reception;

internal sealed record ManualArtworkUpload(Guid Id, IReadOnlyList<GmailFile> Files,
    byte[] SourceFingerprint, int OriginalBytes, int StoredBytes, IReadOnlyList<string> CompressedFiles)
{
    internal const int MaxBytes = 8 * 1024 * 1024;
    internal const int MaxSourceBytes = 48 * 1024 * 1024;
    internal const string SourceLimitMessage = "每批原文件合计最多 48 MiB，请分批上传或缩小单个文件。";
    private static readonly SemaphoreSlim Decoders = new(2);

    internal static async Task<ManualArtworkUpload> Read(IFormCollection form, CancellationToken ct)
    {
        if (!Guid.TryParseExact(form["uploadId"].ToString(), "D", out var id) || id == Guid.Empty)
            throw new InvalidDataException("上传编号无效，请重新选择文件。");
        if (form.Files.Count is 0 or > 10)
            throw new InvalidDataException("每次请选择 1 至 10 个设计稿。");
        if (form.Files.Sum(f => f.Length) > MaxSourceBytes)
            throw new InvalidDataException(SourceLimitMessage);

        var files = new List<GmailFile>(form.Files.Count);
        for (var slot = 0; slot < form.Files.Count; slot++)
        {
            var upload = form.Files.GetFile($"file{slot}");
            if (upload == null)
                throw new InvalidDataException("文件列表不完整，请重新选择。");
            if (upload.Length == 0)
                throw new InvalidDataException("设计稿不能为空文件。");
            var name = Path.GetFileName(upload.FileName.Replace('\\', '/')).Trim();
            if (name.Length is 0 or > 200 || name.Any(char.IsControl))
                throw new InvalidDataException("文件名称无效，请使用 1 至 200 个字符。");
            var mime = Path.GetExtension(name).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".pdf" => "application/pdf",
                _ => throw new InvalidDataException("请选择 PNG、PDF、JPEG 或 WebP 设计稿。")
            };
            using var input = upload.OpenReadStream();
            var bytes = new byte[checked((int)upload.Length)];
            await input.ReadExactlyAsync(bytes, ct);
            if (await ContentError(bytes, mime, ct) is { } error)
                throw new InvalidDataException(error);
            files.Add(new(slot, name, mime, bytes));
        }
        var fingerprint = GmailArtworkStore.UploadFingerprint(files);
        var original = files.Sum(f => f.Bytes.Length);
        var total = original;
        var compressed = new List<string>();
        if (total > MaxBytes)
        {
            await Decoders.WaitAsync(ct);
            try
            {
                foreach (var file in files.OrderByDescending(f => f.Bytes.Length).ToArray())
                {
                    ct.ThrowIfCancellationRequested();
                    var available = MaxBytes - (total - file.Bytes.Length);
                    var target = available > 0 ? available : (int)((long)MaxBytes * file.Bytes.Length / total);
                    var bytes = file.Mime == "application/pdf"
                        ? ArtworkPdfCompression.Compress(file.Bytes, target, ct)
                        : await ArtworkImageCompression.Compress(file.Bytes, file.Mime, target, ct);
                    if (bytes == null || bytes.Length >= file.Bytes.Length) continue;
                    files[file.Slot] = file with { Bytes = bytes };
                    total -= file.Bytes.Length - bytes.Length;
                    compressed.Add(file.Name);
                    if (total <= MaxBytes) break;
                }
            }
            finally { Decoders.Release(); }
            if (total > MaxBytes)
                throw new InvalidDataException("为保留设计稿质量，自动压缩后仍超过 8 MiB。请分批上传，或优化单个文件后再试。");
        }
        return new(id, files, fingerprint, original, total, compressed);
    }

    private static async Task<string?> ContentError(byte[] bytes, string mime, CancellationToken ct)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        await Decoders.WaitAsync(ct);
        try
        {
            if (mime == "application/pdf")
            {
                if (!bytes.AsSpan().StartsWith("%PDF-"u8)) throw new InvalidDataException();
                using var pdf = PdfReader.Open(stream, PdfDocumentOpenMode.Modify);
                if (pdf.PageCount < 1 || pdf.SecuritySettings.IsEncrypted) throw new InvalidDataException();
                return null;
            }
            if (Image.DetectFormat(bytes).DefaultMimeType != mime) throw new InvalidDataException();
            var options = new DecoderOptions { SkipMetadata = true, MaxFrames = 1 };
            var info = await Image.IdentifyAsync(options, stream, ct);
            if ((long)info.Width * info.Height > 30_000_000)
                return "图片超过 3000 万像素，请缩小后上传。";
            stream.Position = 0;
            using var image = await Image.LoadAsync(options, stream, ct);
            return null;
        }
        catch (Exception e) when (e is not OperationCanceledException and not OutOfMemoryException)
        {
            return "文件内容损坏、已加密或与扩展名不符，请重新导出后上传。";
        }
        finally { Decoders.Release(); }
    }
}
