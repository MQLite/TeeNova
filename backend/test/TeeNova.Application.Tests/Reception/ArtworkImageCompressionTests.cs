using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using TeeNova.Reception;

namespace TeeNova.Tests.Reception;

public sealed class ArtworkImageCompressionTests
{
    [Fact]
    public async Task Recompresses_png_losslessly_at_full_precision_even_when_target_is_unreachable()
    {
        var pixel = new Rgba64(4781, 24089, 51039, 10373);
        using var image = new Image<Rgba64>(120, 100, pixel);
        using var input = new MemoryStream();
        image.SaveAsPng(input, new PngEncoder
        {
            BitDepth = PngBitDepth.Bit16,
            CompressionLevel = PngCompressionLevel.NoCompression
        });
        var candidate = await ArtworkImageCompression.Compress(input.ToArray(), "image/png", 1, default);

        Assert.NotNull(candidate);
        Assert.True(candidate.Length < input.Length);
        Assert.Equal("image/png", Image.DetectFormat(candidate).DefaultMimeType);
        using var decoded = Image.Load<Rgba64>(candidate);
        Assert.Equal(image.Size, decoded.Size);
        Assert.Equal(pixel, decoded[42, 55]);
    }

    [Theory]
    [InlineData("image/png")]
    [InlineData("image/webp")]
    public async Task Skips_animation(string mime)
    {
        using var image = new Image<Rgba32>(16, 16);
        using var second = new Image<Rgba32>(16, 16, Color.Red);
        image.Frames.AddFrame(second.Frames.RootFrame);
        using var input = new MemoryStream();
        if (mime == "image/png") image.SaveAsPng(input);
        else image.SaveAsWebp(input);

        Assert.Null(await ArtworkImageCompression.Compress(input.ToArray(), mime, 1, default));
    }

    [Fact]
    public async Task Preserves_png_rendering_intent()
    {
        using var image = new Image<Rgba32>(100, 100, Color.DarkRed);
        using var input = new MemoryStream();
        image.SaveAsPng(input, new PngEncoder { CompressionLevel = PngCompressionLevel.NoCompression });
        byte[] srgb = Convert.FromHexString("000000017352474200AECE1CE9");
        var png = input.ToArray();
        byte[] withIntent = [.. png[..33], .. srgb, .. png[33..]];

        var candidate = await ArtworkImageCompression.Compress(withIntent, "image/png", 4096, default);
        Assert.NotNull(candidate);
        Assert.True(candidate.AsSpan().IndexOf(srgb) >= 0);
    }

    [Fact]
    public async Task Preserves_static_webp_transparency()
    {
        var pixel = new Rgba32(32, 54, 76, 128);
        using var image = new Image<Rgba32>(100, 100, pixel);
        using var input = new MemoryStream();
        image.SaveAsWebp(input, new WebpEncoder { FileFormat = WebpFileFormatType.Lossless });
        var original = input.ToArray();
        // The original container is valid with trailing padding.
        Array.Resize(ref original, original.Length + 1024);
        var candidate = await ArtworkImageCompression.Compress(original, "image/webp", original.Length - 1, default);
        Assert.NotNull(candidate);
        Assert.Equal("image/webp", Image.DetectFormat(candidate).DefaultMimeType);
        using var output = Image.Load<Rgba32>(candidate);
        Assert.Equal(pixel, output[50, 50]);
    }

    [Fact]
    public async Task Smaller_jpeg_keeps_original_dimensions_and_orientation()
    {
        using var image = new Image<Rgba32>(160, 100);
        var random = new Random(42);
        image.ProcessPixelRows(rows =>
        {
            for (var y = 0; y < rows.Height; y++)
                foreach (ref var pixel in rows.GetRowSpan(y))
                    pixel = new Rgba32((byte)random.Next(256), (byte)random.Next(256), (byte)random.Next(256));
        });
        image.Metadata.ExifProfile = new ExifProfile();
        image.Metadata.ExifProfile.SetValue(ExifTag.Orientation, (ushort)6);
        using var input = new MemoryStream();
        image.SaveAsJpeg(input, new JpegEncoder { Quality = 100 });

        var candidate = await ArtworkImageCompression.Compress(input.ToArray(), "image/jpeg", (int)input.Length / 2, default);
        Assert.NotNull(candidate);
        Assert.True(candidate.Length < input.Length);
        var info = Image.Identify(candidate);
        Assert.Equal("image/jpeg", info.Metadata.DecodedImageFormat!.DefaultMimeType);
        Assert.Equal(image.Size, info.Size);
        Assert.True(info.Metadata.ExifProfile!.TryGetValue(ExifTag.Orientation, out var orientation));
        Assert.Equal((ushort)6, orientation.Value);
    }
}
