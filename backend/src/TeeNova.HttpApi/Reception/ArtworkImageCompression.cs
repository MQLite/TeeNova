using System.Buffers.Binary;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace TeeNova.Reception;

internal static class ArtworkImageCompression
{
    internal static async Task<byte[]?> Compress(byte[] source, string mime, int targetBytes, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (source.Length <= targetBytes || mime is not ("image/png" or "image/jpeg" or "image/webp"))
            return null;
        var colorChunks = new List<ReadOnlyMemory<byte>>();
        if (mime == "image/png" && !ReadPngHeader(source, colorChunks)) return null;
        var colorBytes = colorChunks.Sum(chunk => chunk.Length);

        byte[]? best = null;
        try
        {
            using var input = new MemoryStream(source, writable: false);
            var options = new DecoderOptions { MaxFrames = 2 };
            var info = await Image.IdentifyAsync(options, input, ct);
            if (info.FrameMetadataCollection.Count > 1 ||
                mime == "image/jpeg" && info.Metadata.GetJpegMetadata().ColorType is JpegEncodingColor.Cmyk or JpegEncodingColor.Ycck)
                return null;

            input.Position = 0;
            // Preserve alpha and the full sample precision of 16-bit PNG artwork.
            using Image image = mime == "image/png" && info.Metadata.GetPngMetadata().BitDepth == PngBitDepth.Bit16
                ? await Image.LoadAsync<Rgba64>(options, input, ct)
                : await Image.LoadAsync<Rgba32>(options, input, ct);
            if (image.Frames.Count > 1) return null;

            async Task<bool> TryEncoding(IImageEncoder encoder)
            {
                ct.ThrowIfCancellationRequested();
                using var output = new MemoryStream();
                await image.SaveAsync(output, encoder, ct);
                if (output.Length + colorBytes < (best?.Length ?? source.Length))
                    best = colorBytes == 0 ? output.ToArray() : RestorePngColor(output, colorChunks, colorBytes);
                return best != null && best.Length <= targetBytes;
            }

            var encoders = Encoders(mime, image);
            foreach (var encoder in encoders)
                if (await TryEncoding(encoder)) return best;

            // A single proportional resize is the last resort. Keep at least 75% of
            // each dimension, and leave artwork at or below 2400 px long edge intact.
            var edge = Math.Max(image.Width, image.Height);
            var minimum = Math.Max(2400, (int)Math.Ceiling(edge * 0.75));
            if (edge > minimum)
            {
                var ratio = Math.Sqrt((double)Math.Max(1, targetBytes) / (best?.Length ?? source.Length));
                var newEdge = Math.Clamp((int)(edge * ratio), minimum, edge - 1);
                ct.ThrowIfCancellationRequested();
                image.Mutate(x => x.Resize(new ResizeOptions
                {
                    Size = new Size(newEdge, newEdge),
                    Mode = ResizeMode.Max,
                    Sampler = KnownResamplers.Lanczos3
                }));
                await TryEncoding(encoders[^1]);
            }
        }
        catch (Exception e) when (e is ImageFormatException or NotSupportedException)
        {
            // A validated file whose metadata or encoding cannot be round-tripped
            // can still be retained if compressing the other files frees enough space.
        }
        return best;
    }

    private static bool ReadPngHeader(ReadOnlyMemory<byte> source, List<ReadOnlyMemory<byte>> colorChunks)
    {
        var chunks = source[8..];
        while (chunks.Length >= 12)
        {
            var length = BinaryPrimitives.ReadUInt32BigEndian(chunks.Span);
            var type = chunks.Span.Slice(4, 4);
            // An APNG with a separate default image can decode as just one frame.
            if (length > chunks.Length - 12 || type.SequenceEqual("acTL"u8)) return false;
            if (type.SequenceEqual("IDAT"u8)) return true;
            // ImageSharp 3.x does not round-trip these PNG rendering instructions.
            // They are independent of the sample layout and retain their original CRC.
            if (type.SequenceEqual("sRGB"u8) || type.SequenceEqual("cHRM"u8) ||
                type.SequenceEqual("mDCV"u8) || type.SequenceEqual("cLLI"u8))
            {
                if (colorChunks.Count == 4 || length > 32) return false;
                colorChunks.Add(chunks[..(12 + (int)length)]);
            }
            chunks = chunks[(12 + (int)length)..];
        }
        return false;
    }

    private static byte[] RestorePngColor(MemoryStream encoded, List<ReadOnlyMemory<byte>> colorChunks, int colorBytes)
    {
        // PNG starts with its 8-byte signature and 25-byte IHDR chunk.
        const int headerEnd = 33;
        var pixels = encoded.GetBuffer().AsSpan(0, (int)encoded.Length);
        var restored = new byte[pixels.Length + colorBytes];
        pixels[..headerEnd].CopyTo(restored);
        var offset = headerEnd;
        foreach (var chunk in colorChunks)
        {
            chunk.Span.CopyTo(restored.AsSpan(offset));
            offset += chunk.Length;
        }
        pixels[headerEnd..].CopyTo(restored.AsSpan(offset));
        return restored;
    }

    private static IImageEncoder[] Encoders(string mime, Image image)
    {
        if (mime == "image/png")
        {
            var png = image.Metadata.GetPngMetadata();
            // Palette quantization and transparency keys cannot express all
            // intermediate alpha values introduced by resampling.
            var useRgba = png.ColorType == PngColorType.Palette || png.TransparentColor.HasValue;
            return [new PngEncoder
            {
                BitDepth = useRgba && png.BitDepth != PngBitDepth.Bit16 ? PngBitDepth.Bit8 : png.BitDepth,
                ColorType = useRgba ? PngColorType.RgbWithAlpha : png.ColorType,
                CompressionLevel = PngCompressionLevel.BestCompression,
                FilterMethod = PngFilterMethod.Adaptive,
                TransparentColorMode = PngTransparentColorMode.Preserve
            }];
        }
        if (mime == "image/jpeg")
            return [new JpegEncoder { Quality = 90 }, new JpegEncoder { Quality = 82 }];

        return [
            new WebpEncoder { FileFormat = WebpFileFormatType.Lossless, TransparentColorMode = WebpTransparentColorMode.Preserve },
            new WebpEncoder { FileFormat = WebpFileFormatType.Lossy, Quality = 90 },
            new WebpEncoder { FileFormat = WebpFileFormatType.Lossy, Quality = 82 }
        ];
    }
}
