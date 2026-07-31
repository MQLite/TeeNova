using System;
using Microsoft.Extensions.Options;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderIntakeOptions
{
    public const string SectionName = "AiOrderIntake";
    public const long AbsoluteMultipartCeilingBytes = 20L * 1024 * 1024;

    public long MaxFileBytes { get; set; } = 15L * 1024 * 1024;
    public int MaxFilesPerImport { get; set; } = 12;
    public long MaxTotalBytesPerImport { get; set; } = 60L * 1024 * 1024;
    public int MaxPdfPages { get; set; } = 12;
    public int MaxImageWidth { get; set; } = 10000;
    public int MaxImageHeight { get; set; } = 10000;
    public long MaxImagePixels { get; set; } = 30_000_000;
    public int SmallImageWidth { get; set; } = 1200;
    public int SmallImageHeight { get; set; } = 900;
    public double DarkLuminanceThreshold { get; set; } = 0.08;
    public double BrightLuminanceThreshold { get; set; } = 0.92;
    public int DuplicateLookbackDays { get; set; } = 30;
}

public sealed class AiOrderIntakeOptionsValidator : IValidateOptions<AiOrderIntakeOptions>
{
    public ValidateOptionsResult Validate(string? name, AiOrderIntakeOptions options)
    {
        if (options.MaxFileBytes <= 0 ||
            options.MaxFileBytes > AiOrderIntakeOptions.AbsoluteMultipartCeilingBytes)
            return Fail("MaxFileBytes must be positive and no greater than the multipart ceiling.");
        if (options.MaxFilesPerImport is < 1 or > 50)
            return Fail("MaxFilesPerImport must be between 1 and 50.");
        if (options.MaxTotalBytesPerImport < options.MaxFileBytes)
            return Fail("MaxTotalBytesPerImport must be at least MaxFileBytes.");
        if (options.MaxPdfPages is < 1 or > 100)
            return Fail("MaxPdfPages must be between 1 and 100.");
        if (options.MaxImageWidth < 1 ||
            options.MaxImageHeight < 1 ||
            options.MaxImagePixels < 1)
            return Fail("Image ceilings must be positive.");
        if (options.SmallImageWidth < 1 || options.SmallImageHeight < 1)
            return Fail("Small-image thresholds must be positive.");
        if (options.DarkLuminanceThreshold is < 0 or >= 0.5 ||
            options.BrightLuminanceThreshold is <= 0.5 or > 1 ||
            options.DarkLuminanceThreshold >= options.BrightLuminanceThreshold)
            return Fail("Brightness thresholds are invalid.");
        if (options.DuplicateLookbackDays is < 1 or > 3650)
            return Fail("DuplicateLookbackDays must be between 1 and 3650.");

        return ValidateOptionsResult.Success;
    }

    private static ValidateOptionsResult Fail(string message) =>
        ValidateOptionsResult.Fail(
            $"{AiOrderIntakeOptions.SectionName}: {message}");
}
