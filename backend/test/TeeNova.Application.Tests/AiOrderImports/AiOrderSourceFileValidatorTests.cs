using Microsoft.Extensions.Options;
using PdfSharp.Pdf;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using Volo.Abp;

namespace TeeNova.AiOrderImports.Tests;

public class AiOrderSourceFileValidatorTests
{
    [Theory]
    [InlineData("page.jpg", "image/jpeg", "jpeg")]
    [InlineData("page.JPEG", "image/jpeg; charset=binary", "jpeg")]
    [InlineData("page.png", "image/png", "png")]
    [InlineData("page.webp", "image/webp", "webp")]
    [InlineData("page.pdf", "application/pdf", "pdf")]
    public void Declaration_accepts_only_matching_supported_formats(
        string fileName,
        string contentType,
        string expectedKind)
    {
        var result = CreateValidator().ValidateDeclaration(fileName, contentType, 100);

        Assert.Equal(expectedKind, result.Kind);
    }

    [Theory]
    [InlineData("page.heic", "image/heic", AiOrderImportErrorCodes.UnsupportedFileType)]
    [InlineData("../page.exe", "application/octet-stream", AiOrderImportErrorCodes.UnsupportedFileType)]
    [InlineData("page.jpg", "image/png", AiOrderImportErrorCodes.FileTypeMismatch)]
    public void Declaration_rejects_unsupported_or_mismatched_formats(
        string fileName,
        string contentType,
        string expectedCode)
    {
        var exception = Assert.Throws<BusinessException>(() =>
            CreateValidator().ValidateDeclaration(fileName, contentType, 100));

        Assert.Equal(expectedCode, exception.Code);
    }

    [Fact]
    public void Declaration_rejects_empty_and_oversized_files()
    {
        var validator = CreateValidator(maxFileBytes: 100);

        Assert.Equal(
            AiOrderImportErrorCodes.EmptyFile,
            Assert.Throws<BusinessException>(() =>
                validator.ValidateDeclaration("page.png", "image/png", 0)).Code);
        Assert.Equal(
            AiOrderImportErrorCodes.FileTooLarge,
            Assert.Throws<BusinessException>(() =>
                validator.ValidateDeclaration("page.png", "image/png", 101)).Code);
    }

    [Theory]
    [InlineData("jpeg", "image/jpeg")]
    [InlineData("png", "image/png")]
    [InlineData("webp", "image/webp")]
    public async Task Inspect_accepts_valid_images_and_returns_dimensions(
        string kind,
        string contentType)
    {
        await using var stream = await CreateImageAsync(kind, 64, 48, Color.Gray);

        var inspected = await CreateValidator().InspectAsync(
            stream,
            new DeclaredSourceFormat(kind, contentType),
            default);

        Assert.Equal(64, inspected.ImageWidth);
        Assert.Equal(48, inspected.ImageHeight);
        Assert.Null(inspected.PageCount);
        Assert.Contains(inspected.Warnings, warning => warning.Code == "IMAGE_TOO_SMALL");
        Assert.Contains(inspected.Warnings, warning => warning.Code == "IMAGE_LOW_RESOLUTION");
    }

    [Fact]
    public async Task Inspect_accepts_valid_pdf_and_enforces_page_limit()
    {
        await using var valid = CreatePdf(pageCount: 2);
        var validator = CreateValidator(maxPdfPages: 2);

        var inspected = await validator.InspectAsync(
            valid,
            new DeclaredSourceFormat("pdf", "application/pdf"),
            default);

        Assert.Equal(2, inspected.PageCount);

        await using var tooLong = CreatePdf(pageCount: 3);
        var exception = await Assert.ThrowsAsync<BusinessException>(() =>
            validator.InspectAsync(
                tooLong,
                new DeclaredSourceFormat("pdf", "application/pdf"),
                default));
        Assert.Equal(AiOrderImportErrorCodes.PdfPageLimitExceeded, exception.Code);
    }

    [Fact]
    public async Task Inspect_rejects_magic_mismatch_and_malformed_content()
    {
        await using var wrongMagic = new MemoryStream("not-a-png"u8.ToArray());
        var validator = CreateValidator();

        var magicException = await Assert.ThrowsAsync<BusinessException>(() =>
            validator.InspectAsync(
                wrongMagic,
                new DeclaredSourceFormat("png", "image/png"),
                default));
        Assert.Equal(AiOrderImportErrorCodes.FileTypeMismatch, magicException.Code);

        await using var malformed = new MemoryStream(
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
        var malformedException = await Assert.ThrowsAsync<BusinessException>(() =>
            validator.InspectAsync(
                malformed,
                new DeclaredSourceFormat("png", "image/png"),
                default));
        Assert.Equal(AiOrderImportErrorCodes.InvalidSourceContent, malformedException.Code);
    }

    [Fact]
    public async Task Inspect_enforces_image_dimensions_and_emits_brightness_warning()
    {
        await using var tooWide = await CreateImageAsync("png", 101, 10, Color.Gray);
        var bounded = CreateValidator(maxImageWidth: 100);
        var dimensionException = await Assert.ThrowsAsync<BusinessException>(() =>
            bounded.InspectAsync(
                tooWide,
                new DeclaredSourceFormat("png", "image/png"),
                default));
        Assert.Equal(AiOrderImportErrorCodes.ImageDimensionsExceeded, dimensionException.Code);

        await using var dark = await CreateImageAsync("png", 64, 64, Color.Black);
        var inspected = await CreateValidator().InspectAsync(
            dark,
            new DeclaredSourceFormat("png", "image/png"),
            default);
        Assert.Contains(
            inspected.Warnings,
            warning => warning.Code == "IMAGE_EXTREMELY_DARK");
    }

    [Fact]
    public void Options_validator_rejects_unsafe_limits()
    {
        var validator = new AiOrderIntakeOptionsValidator();

        Assert.False(validator.Validate(null, new AiOrderIntakeOptions
        {
            MaxFileBytes = AiOrderIntakeOptions.AbsoluteMultipartCeilingBytes + 1,
        }).Succeeded);
        Assert.False(validator.Validate(null, new AiOrderIntakeOptions
        {
            MaxFilesPerImport = 0,
        }).Succeeded);
        Assert.True(validator.Validate(null, new AiOrderIntakeOptions()).Succeeded);
    }

    private static AiOrderSourceFileValidator CreateValidator(
        long maxFileBytes = 1024 * 1024,
        int maxPdfPages = 12,
        int maxImageWidth = 1000) =>
        new(Options.Create(new AiOrderIntakeOptions
        {
            MaxFileBytes = maxFileBytes,
            MaxTotalBytesPerImport = Math.Max(maxFileBytes, 1024 * 1024),
            MaxPdfPages = maxPdfPages,
            MaxImageWidth = maxImageWidth,
            MaxImageHeight = 1000,
            MaxImagePixels = 1_000_000,
        }));

    private static async Task<MemoryStream> CreateImageAsync(
        string kind,
        int width,
        int height,
        Color color)
    {
        using var image = new Image<Rgba32>(width, height, color);
        var stream = new MemoryStream();
        switch (kind)
        {
            case "jpeg":
                await image.SaveAsync(stream, new JpegEncoder());
                break;
            case "png":
                await image.SaveAsync(stream, new PngEncoder());
                break;
            case "webp":
                await image.SaveAsync(stream, new WebpEncoder());
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(kind));
        }

        stream.Position = 0;
        return stream;
    }

    private static MemoryStream CreatePdf(int pageCount)
    {
        using var document = new PdfDocument();
        for (var index = 0; index < pageCount; index++)
            document.AddPage();
        var stream = new MemoryStream();
        document.Save(stream, closeStream: false);
        stream.Position = 0;
        return stream;
    }
}
