using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using TeeNova.AiOrderImports.Recognition;
using Xunit;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderRecognitionImageCompressorTests
{
    private static readonly AiOrderRecognitionImageBudget Budget =
        new(1568, 3L * 1024 * 1024, 80, 50);

    [Fact]
    public async Task Oversized_capture_is_downscaled_and_shrunk_before_the_provider_call()
    {
        var original = NoisyJpeg(4032, 3024);

        var result = await AiOrderRecognitionImageCompressor.CompressAsync(
            original,
            "image/jpeg",
            0,
            Budget,
            CancellationToken.None);

        Assert.True(result.Recompressed);
        Assert.Equal("image/jpeg", result.ContentType);
        Assert.Equal(1568, result.Width);
        Assert.Equal(1176, result.Height);
        Assert.True(
            result.Content.LongLength < original.LongLength,
            "Compression must reduce the inline payload.");
        Assert.True(result.Content.LongLength <= Budget.MaximumBytes);
    }

    [Fact]
    public async Task Aspect_ratio_is_preserved_when_the_long_edge_is_the_height()
    {
        var result = await AiOrderRecognitionImageCompressor.CompressAsync(
            NoisyJpeg(2000, 4000),
            "image/jpeg",
            0,
            Budget,
            CancellationToken.None);

        Assert.Equal(784, result.Width);
        Assert.Equal(1568, result.Height);
    }

    [Fact]
    public async Task Image_already_inside_the_budget_is_sent_untouched()
    {
        var original = NoisyJpeg(1200, 900);

        var result = await AiOrderRecognitionImageCompressor.CompressAsync(
            original,
            "image/jpeg",
            0,
            Budget,
            CancellationToken.None);

        Assert.False(result.Recompressed);
        Assert.Same(original, result.Content);
        Assert.Equal(1200, result.Width);
    }

    [Fact]
    public async Task Rotation_is_applied_in_the_same_pass_as_compression()
    {
        var result = await AiOrderRecognitionImageCompressor.CompressAsync(
            NoisyJpeg(2400, 1200),
            "image/jpeg",
            90,
            Budget,
            CancellationToken.None);

        Assert.True(result.Recompressed);
        Assert.Equal(784, result.Width);
        Assert.Equal(1568, result.Height);
    }

    [Fact]
    public async Task Small_png_stays_lossless()
    {
        var result = await AiOrderRecognitionImageCompressor.CompressAsync(
            FlatPng(3000, 2000),
            "image/png",
            0,
            Budget,
            CancellationToken.None);

        Assert.True(result.Recompressed);
        Assert.Equal("image/png", result.ContentType);
        Assert.Equal(1568, result.Width);
    }

    [Fact]
    public async Task Png_that_cannot_fit_the_budget_falls_back_to_jpeg()
    {
        var tightBudget = Budget with { MaximumBytes = 96 * 1024 };

        var result = await AiOrderRecognitionImageCompressor.CompressAsync(
            NoisyPng(2400, 1800),
            "image/png",
            0,
            tightBudget,
            CancellationToken.None);

        Assert.Equal("image/jpeg", result.ContentType);
        Assert.True(result.Content.LongLength <= tightBudget.MaximumBytes);
    }

    [Fact]
    public async Task Undecodable_content_is_rejected_with_a_safe_code()
    {
        var exception = await Assert.ThrowsAsync<Volo.Abp.BusinessException>(() =>
            AiOrderRecognitionImageCompressor.CompressAsync(
                [1, 2, 3, 4],
                "image/jpeg",
                0,
                Budget,
                CancellationToken.None));

        Assert.Equal(AiOrderImportErrorCodes.RecognitionSourceUnsupported, exception.Code);
    }

    [Fact]
    public void Pdf_is_not_routed_through_the_image_compressor()
    {
        Assert.False(AiOrderRecognitionImageCompressor.IsSupported("application/pdf"));
        Assert.True(AiOrderRecognitionImageCompressor.IsSupported("image/webp"));
    }

    private static byte[] NoisyJpeg(int width, int height) =>
        Encode(Noise(width, height), new JpegEncoder { Quality = 95 });

    private static byte[] NoisyPng(int width, int height) =>
        Encode(Noise(width, height), new PngEncoder());

    private static byte[] FlatPng(int width, int height)
    {
        using var image = new Image<Rgb24>(width, height, new Rgb24(250, 250, 250));
        return Encode(image, new PngEncoder());
    }

    private static Image<Rgb24> Noise(int width, int height)
    {
        // Deterministic high-entropy content so encoders cannot collapse the file
        // to a few kilobytes and hide a missing downscale.
        var random = new Random(20260804);
        var image = new Image<Rgb24>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgb24(
                        (byte)random.Next(256),
                        (byte)random.Next(256),
                        (byte)random.Next(256));
                }
            }
        });
        return image;
    }

    private static byte[] Encode(Image image, IImageEncoder encoder)
    {
        using (image)
        {
            using var output = new MemoryStream();
            image.Save(output, encoder);
            return output.ToArray();
        }
    }
}
