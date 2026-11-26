using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.AiOrderImports.Recognition;

public sealed class AiOrderRecognitionSourcePreparer : ITransientDependency
{
    private static readonly JsonSerializerOptions TextJson = new(JsonSerializerDefaults.Web) { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private readonly IRepository<AiOrderSourceDocument, Guid> _sources;
    private readonly IPrivateObjectStorage _privateStorage;
    private readonly AiOrderRecognitionOptions _options;

    public AiOrderRecognitionSourcePreparer(
        IRepository<AiOrderSourceDocument, Guid> sources,
        IPrivateObjectStorage privateStorage,
        IOptions<AiOrderRecognitionOptions> options)
    {
        _sources = sources;
        _privateStorage = privateStorage;
        _options = options.Value;
    }

    public async Task<IReadOnlyList<AiOrderRecognitionSourceDescriptor>> DescribeAsync(
        AiOrderImport import,
        AiOrderRecognitionModelSelection selection,
        CancellationToken cancellationToken)
    {
        var query = await _sources.GetQueryableAsync();
        var sources = await query
            .Where(x => x.ImportId == import.Id && x.ContentDeletedAt == null)
            .OrderBy(x => x.Sequence)
            .ToListAsync(cancellationToken);
        if (sources.Count == 0)
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionRequiresSources);
        var batch = import.ContractVersion == ReceptionRecognition.BatchContract;
        if (batch && sources.All(x => ReceptionBatchLimits.IsSupplement(x.OriginalFileName)))
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionRequiresSources, "Attach at least one order document before recognition.");
        if (sources.Count > _options.MaximumSources ||
            sources.Sum(x => x.ByteSize) > _options.MaximumSourceBytes)
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceLimitExceeded);

        foreach (var source in sources)
        {
            var supported = source.ContentType switch
            {
                "text/plain" => ReceptionRecognition.IsReceptionContract(import.ContractVersion) && selection.ProviderId == "openai",
                "text/csv" => batch && selection.ProviderId == "openai",
                "application/pdf" => selection.SupportsPdf,
                "image/jpeg" or "image/png" or "image/webp" => selection.SupportsImages,
                _ => false,
            };
            if (!supported)
                throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceUnsupported);
        }

        return sources.Select(x => new AiOrderRecognitionSourceDescriptor(
            x.Id,
            x.Sequence,
            x.ContentType,
            x.ByteSize,
            x.Sha256,
            x.RotationDegrees,
            x.PageCount,
            batch && ReceptionBatchLimits.IsSupplement(x.OriginalFileName))).ToArray();
    }

    public async Task<IReadOnlyList<AiOrderRecognitionSource>> PrepareAsync(
        Guid importId,
        IReadOnlyCollection<AiOrderRecognitionSourceDescriptor> snapshot,
        CancellationToken cancellationToken,
        bool receptionBatch = false)
    {
        var query = await _sources.GetQueryableAsync();
        var ids = snapshot.Select(x => x.Id).ToArray();
        var sources = await query
            .Where(x => x.ImportId == importId &&
                        x.ContentDeletedAt == null &&
                        ids.Contains(x.Id))
            .OrderBy(x => x.Sequence)
            .ToListAsync(cancellationToken);
        if (sources.Count != snapshot.Count)
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceSnapshotChanged);

        var expected = snapshot.OrderBy(x => x.Sequence).ToArray();
        var prepared = new List<AiOrderRecognitionSource>(sources.Count);
        var payloadBytes = 0L;
        for (var index = 0; index < sources.Count; index++)
        {
            var source = sources[index];
            var descriptor = expected[index];
            if (source.Id != descriptor.Id ||
                source.Sequence != descriptor.Sequence ||
                source.Sha256 != descriptor.Sha256 ||
                source.RotationDegrees != descriptor.RotationDegrees ||
                source.ContentType != descriptor.ContentType)
                throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceSnapshotChanged);

            await using var input = await _privateStorage.OpenReadAsync(
                source.PrivateObjectKey,
                cancellationToken);
            var bytes = await ReadBoundedAsync(
                input,
                descriptor.ByteSize,
                _options.MaximumSourceBytes,
                cancellationToken);
            var contentType = source.ContentType;
            IReadOnlySet<int>? referenceLines = null;
            if (AiOrderRecognitionImageCompressor.IsSupported(contentType))
            {
                // Rotation, downscale, and re-encode happen in one decode pass so the
                // provider never receives more resolution than it can use.
                var image = await AiOrderRecognitionImageCompressor.CompressAsync(
                    bytes,
                    contentType,
                    source.RotationDegrees,
                    ImageBudget(),
                    cancellationToken);
                bytes = image.Content;
                contentType = image.ContentType;
            }
            else if (receptionBatch && contentType is ("text/plain" or "text/csv"))
            {
                var text = Encoding.UTF8.GetString(bytes);
                if (contentType == "text/csv")
                {
                    var rows = ReceptionDelimitedText.ParseCsv(text);
                    referenceLines = rows.Select(x => x.Line).ToHashSet();
                    bytes = JsonSerializer.SerializeToUtf8Bytes(new { header = rows[0], rows = rows.Skip(1) }, TextJson);
                    contentType = "text/plain";
                }
                else
                {
                    var lines = ReceptionDelimitedText.Normalize(text).Split('\n');
                    var numbered = lines.Select((value, line) => new { line = line + 1, text = value }).ToArray();
                    referenceLines = numbered.Where(x => !string.IsNullOrWhiteSpace(x.text)).Select(x => x.line).ToHashSet();
                    bytes = JsonSerializer.SerializeToUtf8Bytes(numbered.Where(x => referenceLines.Contains(x.line)), TextJson);
                }
            }

            payloadBytes += bytes.LongLength;
            if (payloadBytes > _options.MaximumRequestPayloadBytes)
                throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceLimitExceeded);

            prepared.Add(new AiOrderRecognitionSource(
                source.Id,
                source.Sequence,
                $"source-{source.Sequence}-{source.Id:N}",
                contentType,
                bytes,
                source.Sha256,
                source.RotationDegrees,
                descriptor.IsSupplement,
                referenceLines));
        }

        return prepared;
    }

    private AiOrderRecognitionImageBudget ImageBudget() =>
        new(
            _options.MaximumImageEdgePixels,
            _options.MaximumImageBytes,
            _options.ImageQuality,
            _options.MinimumImageQuality);

    private static async Task<byte[]> ReadBoundedAsync(
        Stream input,
        long expectedBytes,
        long maximumBytes,
        CancellationToken cancellationToken)
    {
        if (expectedBytes > maximumBytes)
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceLimitExceeded);
        using var output = new MemoryStream((int)Math.Min(expectedBytes, int.MaxValue));
        var buffer = new byte[81920];
        while (true)
        {
            var read = await input.ReadAsync(buffer, cancellationToken);
            if (read == 0)
                break;
            if (output.Length + read > maximumBytes)
                throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceLimitExceeded);
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        if (output.Length != expectedBytes)
            throw new BusinessException(AiOrderImportErrorCodes.RecognitionSourceSnapshotChanged);
        return output.ToArray();
    }
}
