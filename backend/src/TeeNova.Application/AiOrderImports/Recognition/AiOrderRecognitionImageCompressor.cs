using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using Volo.Abp;

namespace TeeNova.AiOrderImports.Recognition;

/// <summary>
/// Downscales and re-encodes an intake image before it is inlined into a provider
/// request. Vision models discard resolution above roughly 1.5k pixels on the long
/// edge, and every provider rejects oversized inline attachments, so sending the
/// original 15 MB camera capture only buys a failed call and wasted input tokens.
/// </summary>
public static class AiOrderRecognitionImageCompressor
{
    public const string JpegContentType = "image/jpeg";
    public const string PngContentType = "image/png";
    public const string WebpContentType = "image/webp";

    private const int MinimumEdgePixels = 256;
    private const int MaximumDownscalePasses = 4;
    private const int QualityStep = 10;

    public static bool IsSupported(string contentType) =>
        contentType is JpegContentType or PngContentType or WebpContentType;

    public static async Task<AiOrderRecognitionPreparedImage> CompressAsync(
        byte[] content,
        string contentType,
        int rotationDegrees,
        AiOrderRecognitionImageBudget budget,
        CancellationToken cancellationToken)
    {
        if (!IsSupported(contentType))
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceUnsupported);

        using var image = Load(content);
        if (rotationDegrees != 0)
            image.Mutate(context => context.Rotate(rotationDegrees));

        var longestEdge = Math.Max(image.Width, image.Height);
        if (rotationDegrees == 0 &&
            longestEdge <= budget.MaximumEdgePixels &&
            content.LongLength <= budget.MaximumBytes)
        {
            // Already small enough; re-encoding would only add a generation of loss.
            return new AiOrderRecognitionPreparedImage(
                content,
                contentType,
                image.Width,
                image.Height,
                false);
        }

        image.Metadata.ExifProfile = null;
        image.Metadata.IccProfile = null;
        image.Metadata.XmpProfile = null;
        image.Metadata.IptcProfile = null;

        var targetEdge = Math.Min(longestEdge, budget.MaximumEdgePixels);
        var outputContentType = contentType;
        for (var pass = 0; ; pass++)
        {
            using var candidate = Resize(image, targetEdge);
            var quality = budget.Quality;
            while (true)
            {
                var encoded = await EncodeAsync(
                    candidate,
                    outputContentType,
                    quality,
                    cancellationToken);
                if (encoded.LongLength <= budget.MaximumBytes)
                {
                    return new AiOrderRecognitionPreparedImage(
                        encoded,
                        outputContentType,
                        candidate.Width,
                        candidate.Height,
                        true);
                }
                if (outputContentType == PngContentType)
                {
                    // Lossless is only affordable while it stays inside the budget.
                    outputContentType = JpegContentType;
                    continue;
                }
                if (quality <= budget.MinimumQuality)
                    break;
                quality = Math.Max(budget.MinimumQuality, quality - QualityStep);
            }

            if (pass >= MaximumDownscalePasses || targetEdge <= MinimumEdgePixels)
                throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceLimitExceeded);
            targetEdge = Math.Max(MinimumEdgePixels, targetEdge * 3 / 4);
        }
    }

    private static Image Load(byte[] content)
    {
        try
        {
            return Image.Load(content);
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceUnsupported);
        }
    }

    private static Image Resize(Image image, int targetEdge)
    {
        var clone = image.Clone(context => context.Resize(new ResizeOptions
        {
            Size = new Size(targetEdge, targetEdge),
            Mode = ResizeMode.Max,
            Sampler = KnownResamplers.Lanczos3,
        }));
        return clone;
    }

    private static async Task<byte[]> EncodeAsync(
        Image image,
        string contentType,
        int quality,
        CancellationToken cancellationToken)
    {
        using var output = new MemoryStream();
        switch (contentType)
        {
            case JpegContentType:
                await image.SaveAsync(
                    output,
                    new JpegEncoder { Quality = quality },
                    cancellationToken);
                break;
            case PngContentType:
                await image.SaveAsync(
                    output,
                    new PngEncoder { CompressionLevel = PngCompressionLevel.BestCompression },
                    cancellationToken);
                break;
            case WebpContentType:
                await image.SaveAsync(
                    output,
                    new WebpEncoder
                    {
                        Quality = quality,
                        FileFormat = WebpFileFormatType.Lossy,
                    },
                    cancellationToken);
                break;
            default:
                throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceUnsupported);
        }
        return output.ToArray();
    }
}

public sealed record AiOrderRecognitionImageBudget(
    int MaximumEdgePixels,
    long MaximumBytes,
    int Quality,
    int MinimumQuality);

public sealed record AiOrderRecognitionPreparedImage(
    byte[] Content,
    string ContentType,
    int Width,
    int Height,
    bool Recompressed);
