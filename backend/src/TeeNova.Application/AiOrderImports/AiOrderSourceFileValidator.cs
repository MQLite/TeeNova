using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using PdfSharp.Pdf.IO;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderSourceFileValidator : ITransientDependency
{
    private static readonly IReadOnlyDictionary<string, DeclaredSourceFormat> Formats =
        new Dictionary<string, DeclaredSourceFormat>(StringComparer.OrdinalIgnoreCase)
        {
            [".jpg"] = new("jpeg", "image/jpeg"),
            [".jpeg"] = new("jpeg", "image/jpeg"),
            [".png"] = new("png", "image/png"),
            [".webp"] = new("webp", "image/webp"),
            [".pdf"] = new("pdf", "application/pdf"),
        };

    private readonly AiOrderIntakeOptions _options;

    public AiOrderSourceFileValidator(IOptions<AiOrderIntakeOptions> options)
    {
        _options = options.Value;
    }

    public DeclaredSourceFormat ValidateDeclaration(
        string fileName,
        string declaredContentType,
        long declaredLength)
    {
        if (declaredLength <= 0)
            throw Safe(AiOrderImportErrorCodes.EmptyFile, "The selected file is empty.");
        if (declaredLength > _options.MaxFileBytes)
            throw Safe(AiOrderImportErrorCodes.FileTooLarge, "The selected file is too large.");

        var extension = Path.GetExtension(Path.GetFileName(fileName));
        if (string.IsNullOrWhiteSpace(extension) || !Formats.TryGetValue(extension, out var format))
        {
            throw Safe(
                AiOrderImportErrorCodes.UnsupportedFileType,
                "Supported formats are JPEG, PNG, WebP, and PDF.");
        }

        var normalizedContentType = declaredContentType
            .Split(';', 2)[0]
            .Trim()
            .ToLowerInvariant();
        if (!string.Equals(normalizedContentType, format.ContentType, StringComparison.Ordinal))
        {
            throw Safe(
                AiOrderImportErrorCodes.FileTypeMismatch,
                "The file extension and declared content type do not match.");
        }

        return format;
    }

    public async Task<InspectedSourceFile> InspectAsync(
        Stream content,
        DeclaredSourceFormat expected,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanSeek)
            throw new InvalidOperationException("Stored private content must be seekable.");

        var header = new byte[12];
        var headerRead = await content.ReadAsync(header, cancellationToken);
        content.Position = 0;
        if (!MagicMatches(header.AsSpan(0, headerRead), expected.Kind))
        {
            throw Safe(
                AiOrderImportErrorCodes.FileTypeMismatch,
                "The file signature does not match its extension and content type.");
        }

        return expected.Kind == "pdf"
            ? InspectPdf(content)
            : await InspectImageAsync(content, cancellationToken);
    }

    private InspectedSourceFile InspectPdf(Stream content)
    {
        try
        {
            using var document = PdfReader.Open(content, PdfDocumentOpenMode.Import);
            var pageCount = document.PageCount;
            if (pageCount < 1)
                throw Safe(
                    AiOrderImportErrorCodes.InvalidSourceContent,
                    "The PDF does not contain a readable page.");
            if (pageCount > _options.MaxPdfPages)
                throw Safe(
                    AiOrderImportErrorCodes.PdfPageLimitExceeded,
                    $"PDF files may contain at most {_options.MaxPdfPages} pages.");

            var warnings = new List<SourceQualityWarning>();
            if (pageCount >= Math.Max(1, (int)Math.Ceiling(_options.MaxPdfPages * 0.8)))
            {
                warnings.Add(new(
                    "PDF_PAGE_LIMIT_APPROACHING",
                    $"This PDF has {pageCount} pages; the limit is {_options.MaxPdfPages}."));
            }
            return new(null, null, pageCount, warnings);
        }
        catch (BusinessException)
        {
            throw;
        }
        catch
        {
            throw Safe(
                AiOrderImportErrorCodes.InvalidSourceContent,
                "The PDF is malformed or cannot be read safely.");
        }
    }

    private async Task<InspectedSourceFile> InspectImageAsync(
        Stream content,
        CancellationToken cancellationToken)
    {
        try
        {
            var info = await Image.IdentifyAsync(content, cancellationToken);
            if (info is null)
                throw new InvalidImageContentException("No image decoder accepted the content.");

            if (info.Width > _options.MaxImageWidth ||
                info.Height > _options.MaxImageHeight ||
                (long)info.Width * info.Height > _options.MaxImagePixels)
            {
                throw Safe(
                    AiOrderImportErrorCodes.ImageDimensionsExceeded,
                    "The image dimensions exceed the configured safety limit.");
            }

            content.Position = 0;
            using var image = await Image.LoadAsync<Rgba32>(content, cancellationToken);
            var warnings = new List<SourceQualityWarning>();
            if (image.Width < _options.SmallImageWidth ||
                image.Height < _options.SmallImageHeight)
            {
                warnings.Add(new(
                    "IMAGE_TOO_SMALL",
                    "This image may be too small for reliable order-form review."));
            }
            if ((long)image.Width * image.Height < 1_000_000)
            {
                warnings.Add(new(
                    "IMAGE_LOW_RESOLUTION",
                    "This image has low resolution; consider taking a closer photo."));
            }

            var averageLuminance = AverageSampledLuminance(image);
            if (averageLuminance <= _options.DarkLuminanceThreshold)
            {
                warnings.Add(new(
                    "IMAGE_EXTREMELY_DARK",
                    "This image appears extremely dark; retake it in better light if possible."));
            }
            else if (averageLuminance >= _options.BrightLuminanceThreshold)
            {
                warnings.Add(new(
                    "IMAGE_EXTREMELY_BRIGHT",
                    "This image appears extremely bright; check that writing remains visible."));
            }

            return new(image.Width, image.Height, null, warnings);
        }
        catch (BusinessException)
        {
            throw;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            throw Safe(
                AiOrderImportErrorCodes.InvalidSourceContent,
                "The image is malformed or cannot be decoded safely.");
        }
    }

    private static double AverageSampledLuminance(Image<Rgba32> image)
    {
        var stepX = Math.Max(1, image.Width / 64);
        var stepY = Math.Max(1, image.Height / 64);
        double total = 0;
        long count = 0;
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < image.Height; y += stepY)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < image.Width; x += stepX)
                {
                    var pixel = row[x];
                    total += (0.2126 * pixel.R + 0.7152 * pixel.G + 0.0722 * pixel.B) / 255d;
                    count++;
                }
            }
        });
        return count == 0 ? 0 : total / count;
    }

    private static bool MagicMatches(ReadOnlySpan<byte> header, string kind) =>
        kind switch
        {
            "jpeg" => header.Length >= 3 &&
                      header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            "png" => header.Length >= 8 &&
                     header[..8].SequenceEqual(
                         new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            "webp" => header.Length >= 12 &&
                      header[..4].SequenceEqual("RIFF"u8) &&
                      header.Slice(8, 4).SequenceEqual("WEBP"u8),
            "pdf" => header.Length >= 5 && header[..5].SequenceEqual("%PDF-"u8),
            _ => false,
        };

    private static BusinessException Safe(string code, string message) =>
        new(code, message);
}

public sealed record DeclaredSourceFormat(string Kind, string ContentType);

public sealed record SourceQualityWarning(string Code, string Message);

public sealed record InspectedSourceFile(
    int? ImageWidth,
    int? ImageHeight,
    int? PageCount,
    IReadOnlyList<SourceQualityWarning> Warnings);
