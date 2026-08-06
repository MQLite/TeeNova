using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using Volo.Abp;

namespace TeeNova.Portfolio;

public sealed record ProcessedPortfolioImage(byte[] Content, string ContentType, int Width, int Height, string Sha256);

public sealed class PortfolioImageProcessor
{
    private readonly PortfolioOptions _options;
    public PortfolioImageProcessor(IOptions<PortfolioOptions> options) => _options = options.Value;

    public async Task<ProcessedPortfolioImage> ProcessAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length <= 0 || file.Length > _options.MaximumUploadBytes)
            throw new UserFriendlyException("Image size is outside the allowed range.");
        await using var input = file.OpenReadStream();
        ImageInfo info;
        IImageFormat format;
        try
        {
            info = await Image.IdentifyAsync(input, cancellationToken)
                ?? throw new InvalidImageContentException("No image decoder accepted the content.");
            format = info.Metadata.DecodedImageFormat
                ?? throw new UnknownImageFormatException("The decoded format is unavailable.");
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
        {
            throw new UserFriendlyException("The uploaded file is not a valid JPEG, PNG or WebP image.");
        }
        var contentType = format.Name.ToUpperInvariant() switch
        {
            "JPEG" => "image/jpeg", "PNG" => "image/png", "WEBP" => "image/webp",
            _ => throw new UserFriendlyException("Only JPEG, PNG and WebP images are allowed."),
        };
        if ((long)info.Width * info.Height > _options.MaximumPixels)
            throw new UserFriendlyException("Image pixel dimensions exceed the configured limit.");
        input.Position = 0;
        using var image = await Image.LoadAsync(input, cancellationToken);
        image.Mutate(x => x.AutoOrient());
        image.Metadata.ExifProfile = null;
        image.Metadata.IccProfile = null;
        image.Metadata.XmpProfile = null;
        await using var output = new MemoryStream();
        IImageEncoder encoder = contentType switch
        {
            "image/jpeg" => new JpegEncoder { Quality = 90 },
            "image/png" => new PngEncoder(),
            _ => new WebpEncoder { Quality = 90 },
        };
        await image.SaveAsync(output, encoder, cancellationToken);
        var bytes = output.ToArray();
        return new(bytes, contentType, image.Width, image.Height, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
    }
}
