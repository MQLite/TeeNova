using TeeNova.AiOrderImports.Recognition;
using TeeNova.Reception;

namespace TeeNova.AiOrderImports;

public sealed record ReceptionBatchLimits(long MaxFileBytes, int MaxFiles, long MaxTotalBytes, int MaxPdfPages,
    int MaxDescriptionBytes, int MaxTextBytes, int MaxTextCharacters)
{
    public const string SupplementFileName = ReceptionMaterials.SupplementName;

    public static ReceptionBatchLimits FromOptions(AiOrderIntakeOptions intake, AiOrderRecognitionOptions recognition)
    {
        var maxTotalBytes = Math.Min(intake.MaxTotalBytesPerImport,
            Math.Min(recognition.MaximumSourceBytes, recognition.MaximumRequestPayloadBytes));
        const long multipartOverhead = 4096;
        var maxFileBytes = Math.Min(maxTotalBytes,
            Math.Min(intake.MaxFileBytes, AiOrderIntakeOptions.AbsoluteMultipartCeilingBytes - multipartOverhead));
        return new(maxFileBytes, Math.Min(intake.MaxFilesPerImport, recognition.MaximumSources), maxTotalBytes,
            intake.MaxPdfPages, (int)Math.Min(8000, maxFileBytes),
            (int)Math.Min(AiOrderSourceFileValidator.MaxTextLength * 3, maxFileBytes), AiOrderSourceFileValidator.MaxTextLength);
    }

    public static bool IsSupplement(string? fileName) =>
        string.Equals(fileName, SupplementFileName, StringComparison.OrdinalIgnoreCase);
}
