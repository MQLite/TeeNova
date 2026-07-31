using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.AiOrderImports.Recognition;
using TeeNova.Auth;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;

namespace TeeNova.AiOrderImports;

[Authorize(Roles = TeeNovaRoles.Admin)]
[RemoteService(false)]
public class AiOrderImportIntakeAppService : ApplicationService
{
    private const string ContractVersion = "1.0";
    private const string RetentionClass = "standard";

    private readonly IRepository<AiOrderImport, Guid> _imports;
    private readonly IRepository<AiOrderSourceDocument, Guid> _sources;
    private readonly IRepository<AiOrderProcessingAttempt, Guid> _attempts;
    private readonly AiOrderImportFoundationService _foundation;
    private readonly IPrivateObjectStorage _privateStorage;
    private readonly AiOrderSourceFileValidator _fileValidator;
    private readonly AiOrderIntakeOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<AiOrderImportIntakeAppService> _logger;

    public AiOrderImportIntakeAppService(
        IRepository<AiOrderImport, Guid> imports,
        IRepository<AiOrderSourceDocument, Guid> sources,
        IRepository<AiOrderProcessingAttempt, Guid> attempts,
        AiOrderImportFoundationService foundation,
        IPrivateObjectStorage privateStorage,
        AiOrderSourceFileValidator fileValidator,
        IOptions<AiOrderIntakeOptions> options,
        TimeProvider timeProvider,
        ILogger<AiOrderImportIntakeAppService> logger)
    {
        _imports = imports;
        _sources = sources;
        _attempts = attempts;
        _foundation = foundation;
        _privateStorage = privateStorage;
        _fileValidator = fileValidator;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public virtual async Task<AiOrderImportDto> CreateAsync(
        string idempotencyKey,
        CreateAiOrderImportInput? input,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireAdminId();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw Safe(
                AiOrderImportErrorCodes.IdempotencyKeyRequired,
                "An Idempotency-Key header is required.");

        var captureSessionId = input?.CaptureSessionId?.Trim() ?? string.Empty;
        if (captureSessionId.Length > 128 || captureSessionId.Any(char.IsControl))
            throw Safe(AiOrderImportErrorCodes.InvalidRequest, "Capture session ID is invalid.");

        var canonicalRequest =
            $"ai-order-import-create:v1\ncapture-session-length:{captureSessionId.Length}\ncapture-session:{captureSessionId}";
        var requestHash = Convert
            .ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonicalRequest)))
            .ToLowerInvariant();

        var import = await _foundation.CreateIdempotentlyAsync(
            actorId,
            idempotencyKey,
            requestHash,
            ContractVersion,
            RetentionClass,
            cancellationToken: cancellationToken);
        return await BuildImportDtoAsync(import, cancellationToken);
    }

    public virtual async Task<AiOrderImportListResultDto> GetListAsync(
        CancellationToken cancellationToken = default)
    {
        var query = await _imports.GetQueryableAsync();
        var imports = await query
            .OrderByDescending(x => x.CreationTime)
            .Take(50)
            .ToListAsync(cancellationToken);
        var sourceQuery = await _sources.GetQueryableAsync();
        var counts = await sourceQuery
            .Where(x => x.ContentDeletedAt == null)
            .GroupBy(x => x.ImportId)
            .Select(group => new { ImportId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(x => x.ImportId, x => x.Count, cancellationToken);
        var importIds = imports.Select(x => x.Id).ToArray();
        var attemptQuery = await _attempts.GetQueryableAsync();
        var latestAttempts = await attemptQuery
            .Where(x => importIds.Contains(x.ImportId))
            .GroupBy(x => x.ImportId)
            .Select(group => group.OrderByDescending(x => x.AttemptNumber).First())
            .ToListAsync(cancellationToken);
        var latestByImport = latestAttempts.ToDictionary(x => x.ImportId);

        return new AiOrderImportListResultDto
        {
            Items = imports.Select(import => new AiOrderImportSummaryDto
            {
                Id = import.Id,
                Status = import.Status,
                CurrentRevision = import.CurrentRevision,
                CreationTime = import.CreationTime,
                SourceDocumentCount = counts.GetValueOrDefault(import.Id),
                CanModifyDocuments = CanModify(import),
                Recognition = latestByImport.TryGetValue(import.Id, out var attempt)
                    ? AiOrderRecognitionAppService.ToDto(attempt)
                    : null,
            }).ToArray(),
        };
    }

    public virtual async Task<AiOrderImportDto> GetAsync(
        Guid importId,
        CancellationToken cancellationToken = default)
    {
        var import = await FindImportOrThrowAsync(importId, cancellationToken);
        return await BuildImportDtoAsync(import, cancellationToken);
    }

    [UnitOfWork(IsDisabled = true)]
    public virtual async Task<AiOrderSourceUploadResultDto> UploadAsync(
        Guid importId,
        string uploadIdempotencyKey,
        AiOrderCaptureMethod captureMethod,
        Stream sourceStream,
        string originalFileName,
        string declaredContentType,
        long declaredLength,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireAdminId();
        var normalizedUploadKey = uploadIdempotencyKey?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedUploadKey) ||
            normalizedUploadKey.Length > 128)
        {
            throw Safe(
                AiOrderImportErrorCodes.IdempotencyKeyRequired,
                "An Upload-Idempotency-Key header is required.");
        }
        if (!Enum.IsDefined(captureMethod))
            throw Safe(AiOrderImportErrorCodes.InvalidRequest, "Capture method is invalid.");

        var import = await FindImportOrThrowAsync(importId, cancellationToken);
        var sourceQuery = await _sources.GetQueryableAsync();
        var replay = await sourceQuery.SingleOrDefaultAsync(
            x => x.ImportId == importId &&
                 x.UploadIdempotencyKey == normalizedUploadKey,
            cancellationToken);
        var activeSources = await GetActiveSourcesAsync(importId, cancellationToken);
        if (replay is null)
        {
            EnsureModifiable(import);
            if (activeSources.Count >= _options.MaxFilesPerImport)
                throw Safe(
                    AiOrderImportErrorCodes.TooManyDocuments,
                    $"An import may contain at most {_options.MaxFilesPerImport} source documents.");
            if (activeSources.Sum(x => x.ByteSize) + declaredLength > _options.MaxTotalBytesPerImport)
                throw Safe(
                    AiOrderImportErrorCodes.TotalBytesExceeded,
                    "The import exceeds the configured total source-byte limit.");
        }

        var expected = _fileValidator.ValidateDeclaration(
            originalFileName,
            declaredContentType,
            declaredLength);

        string objectKey;
        long actualBytes;
        string sha256;
        try
        {
            using var hashingStream = new HashingLimitedReadStream(
                sourceStream,
                _options.MaxFileBytes);
            objectKey = await _privateStorage.SaveAsync(
                hashingStream,
                PrivateObjectCategory.SourceDocument,
                cancellationToken);
            actualBytes = hashingStream.BytesRead;
            sha256 = hashingStream.GetSha256();
        }
        catch (BusinessException)
        {
            throw;
        }
        catch
        {
            throw Safe(
                AiOrderImportErrorCodes.PrivateStorageFailure,
                "The private source document could not be stored.");
        }

        try
        {
            if (actualBytes <= 0)
                throw Safe(AiOrderImportErrorCodes.EmptyFile, "The selected file is empty.");
            if (replay is null &&
                activeSources.Sum(x => x.ByteSize) + actualBytes > _options.MaxTotalBytesPerImport)
                throw Safe(
                    AiOrderImportErrorCodes.TotalBytesExceeded,
                    "The import exceeds the configured total source-byte limit.");

            InspectedSourceFile inspected;
            await using (var stored = await _privateStorage.OpenReadAsync(objectKey, cancellationToken))
                inspected = await _fileValidator.InspectAsync(stored, expected, cancellationToken);

            if (replay is not null)
            {
                await _privateStorage.DeleteAsync(objectKey, cancellationToken);
                if (!string.Equals(replay.Sha256, sha256, StringComparison.Ordinal))
                    throw Safe(
                        AiOrderImportErrorCodes.UploadIdempotencyConflict,
                        "This upload retry key was already used for different content.");
                return new AiOrderSourceUploadResultDto
                {
                    Document = ToSourceDto(replay),
                    WasIdempotentReplay = true,
                };
            }

            var warnings = inspected.Warnings.ToList();
            if (activeSources.Any(x => string.Equals(x.Sha256, sha256, StringComparison.Ordinal)))
            {
                warnings.Add(new(
                    "DUPLICATE_WITHIN_IMPORT",
                    "This image appears to be another copy of a page already in this import."));
            }

            var matchingImportIds = await FindRecentMatchingImportsAsync(
                importId,
                actorId,
                sha256,
                cancellationToken);
            if (matchingImportIds.Count > 0)
            {
                warnings.Add(new(
                    "POSSIBLE_PREVIOUS_UPLOAD",
                    "This source appears to have been uploaded in a recent import."));
            }

            var qualityWarningsJson = JsonSerializer.Serialize(warnings);
            var sequence = activeSources.Count == 0
                ? 1
                : activeSources.Max(x => x.Sequence) + 1;
            AiOrderSourceDocument source;
            try
            {
                source = await _foundation.AttachSourceMetadataAsync(
                    importId,
                    sequence,
                    captureMethod,
                    objectKey,
                    expected.ContentType,
                    actualBytes,
                    inspected.PageCount,
                    sha256,
                    SanitizeOriginalFileName(originalFileName),
                    actorId,
                    uploadIdempotencyKey: normalizedUploadKey,
                    imageWidth: inspected.ImageWidth,
                    imageHeight: inspected.ImageHeight,
                    qualityWarningsJson: qualityWarningsJson,
                    cancellationToken: cancellationToken);
            }
            catch (BusinessException)
            {
                throw;
            }
            catch
            {
                throw Safe(
                    AiOrderImportErrorCodes.DatabaseMetadataFailure,
                    "The source document metadata could not be saved.");
            }

            _logger.LogInformation(
                "AI order source attached to import {ImportId}; source {SourceDocumentId}; bytes {ByteSize}; pages {PageCount}; warnings {WarningCount}.",
                importId,
                source.Id,
                actualBytes,
                inspected.PageCount,
                warnings.Count);

            return new AiOrderSourceUploadResultDto
            {
                Document = ToSourceDto(source),
                PossibleMatchingImportIds = matchingImportIds,
            };
        }
        catch
        {
            await DeleteStoredObjectBestEffortAsync(objectKey);
            throw;
        }
    }

    public virtual async Task ReorderAsync(
        Guid importId,
        ReorderAiOrderDocumentsInput input,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        await _foundation.ReorderSourcesAsync(importId, input.DocumentIds, cancellationToken);
    }

    public virtual async Task SetRotationAsync(
        Guid importId,
        Guid documentId,
        SetAiOrderDocumentRotationInput input,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(input);
        await _foundation.SetSourceRotationAsync(
            importId,
            documentId,
            input.RotationDegrees,
            cancellationToken);
    }

    [UnitOfWork(IsDisabled = true)]
    public virtual async Task RemoveAsync(
        Guid importId,
        Guid documentId,
        CancellationToken cancellationToken = default)
    {
        var import = await FindImportOrThrowAsync(importId, cancellationToken);
        EnsureModifiable(import);
        var source = await FindActiveSourceOrThrowAsync(importId, documentId, cancellationToken);

        try
        {
            await _privateStorage.DeleteAsync(source.PrivateObjectKey, cancellationToken);
        }
        catch
        {
            await _foundation.MarkSourceDeletionFailedAsync(
                importId,
                documentId,
                "PRIVATE_OBJECT_DELETE_FAILED",
                cancellationToken);
            throw Safe(
                AiOrderImportErrorCodes.PrivateStorageFailure,
                "The private source document could not be removed.");
        }

        await _foundation.MarkSourceDeletedAndReorderAsync(
            importId,
            documentId,
            cancellationToken);
    }

    public virtual Task CancelAsync(
        Guid importId,
        CancellationToken cancellationToken = default) =>
        _foundation.CancelAsync(importId, RequireAdminId(), cancellationToken);

    [UnitOfWork(IsDisabled = true)]
    public virtual async Task<OpenedAiOrderSource> OpenSourceAsync(
        Guid importId,
        Guid documentId,
        AiOrderSourceAccessType accessType,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireAdminId();
        AiOrderSourceDocument? source = null;
        try
        {
            var import = await FindImportOrThrowAsync(importId, cancellationToken);
            source = await FindActiveSourceOrThrowAsync(import.Id, documentId, cancellationToken);
            var stream = await _privateStorage.OpenReadAsync(
                source.PrivateObjectKey,
                cancellationToken);
            await _foundation.RecordSourceAccessAsync(
                importId,
                documentId,
                actorId,
                accessType,
                succeeded: true,
                failureCategory: null,
                cancellationToken);
            return new OpenedAiOrderSource(
                stream,
                source.ContentType,
                BuildSafeFileName(source.Id, source.ContentType));
        }
        catch (BusinessException)
        {
            await RecordFailedAccessBestEffortAsync(
                importId,
                documentId,
                actorId,
                accessType,
                source?.ContentDeletedAt.HasValue == true ? "ContentDeleted" : "NotFound",
                cancellationToken);
            throw;
        }
        catch
        {
            await RecordFailedAccessBestEffortAsync(
                importId,
                documentId,
                actorId,
                accessType,
                "StorageUnavailable",
                cancellationToken);
            throw Safe(
                AiOrderImportErrorCodes.SourceNotFound,
                "The source document was not found.");
        }
    }

    private async Task<AiOrderImportDto> BuildImportDtoAsync(
        AiOrderImport import,
        CancellationToken cancellationToken)
    {
        var sources = await GetActiveSourcesAsync(import.Id, cancellationToken);
        var attemptQuery = await _attempts.GetQueryableAsync();
        var latestAttempt = await attemptQuery
            .Where(x => x.ImportId == import.Id)
            .OrderByDescending(x => x.AttemptNumber)
            .FirstOrDefaultAsync(cancellationToken);
        return new AiOrderImportDto
        {
            Id = import.Id,
            Status = import.Status,
            CurrentRevision = import.CurrentRevision,
            CreationTime = import.CreationTime,
            SourceDocumentCount = sources.Count,
            CanModifyDocuments = CanModify(import),
            CanContinueToRecognition =
                import.Status == AiOrderImportStatus.Uploaded &&
                sources.Count > 0,
            Recognition = latestAttempt is null
                ? null
                : AiOrderRecognitionAppService.ToDto(latestAttempt),
            SourceDocuments = sources.OrderBy(x => x.Sequence).Select(ToSourceDto).ToArray(),
        };
    }

    private async Task<AiOrderImport> FindImportOrThrowAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        var query = await _imports.GetQueryableAsync();
        return await query.SingleOrDefaultAsync(x => x.Id == importId, cancellationToken)
               ?? throw Safe(
                   AiOrderImportErrorCodes.ImportNotFound,
                   "The AI order import was not found.");
    }

    private async Task<AiOrderSourceDocument> FindActiveSourceOrThrowAsync(
        Guid importId,
        Guid documentId,
        CancellationToken cancellationToken)
    {
        var query = await _sources.GetQueryableAsync();
        return await query.SingleOrDefaultAsync(
                   x => x.Id == documentId &&
                        x.ImportId == importId &&
                        x.ContentDeletedAt == null,
                   cancellationToken)
               ?? throw Safe(
                   AiOrderImportErrorCodes.SourceNotFound,
                   "The source document was not found.");
    }

    private async Task<List<AiOrderSourceDocument>> GetActiveSourcesAsync(
        Guid importId,
        CancellationToken cancellationToken)
    {
        var query = await _sources.GetQueryableAsync();
        return await query
            .Where(x => x.ImportId == importId && x.ContentDeletedAt == null)
            .OrderBy(x => x.Sequence)
            .ToListAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<Guid>> FindRecentMatchingImportsAsync(
        Guid currentImportId,
        Guid actorId,
        string sha256,
        CancellationToken cancellationToken)
    {
        var sourceQuery = await _sources.GetQueryableAsync();
        var importQuery = await _imports.GetQueryableAsync();
        var cutoff = _timeProvider.GetUtcNow().UtcDateTime.AddDays(-_options.DuplicateLookbackDays);
        return await (
                from source in sourceQuery
                join import in importQuery on source.ImportId equals import.Id
                where source.Sha256 == sha256 &&
                      source.ContentDeletedAt == null &&
                      import.Id != currentImportId &&
                      import.CreatedByAdminId == actorId &&
                      import.CreationTime >= cutoff
                orderby import.CreationTime descending
                select import.Id)
            .Distinct()
            .Take(5)
            .ToListAsync(cancellationToken);
    }

    private static AiOrderSourceDocumentDto ToSourceDto(AiOrderSourceDocument source) =>
        new()
        {
            Id = source.Id,
            Sequence = source.Sequence,
            CaptureMethod = source.CaptureMethod,
            OriginalFileName = source.OriginalFileName,
            ContentType = source.ContentType,
            ByteSize = source.ByteSize,
            PageCount = source.PageCount,
            ImageWidth = source.ImageWidth,
            ImageHeight = source.ImageHeight,
            RotationDegrees = source.RotationDegrees,
            UploadedAt = source.UploadedAt,
            Warnings = DeserializeWarnings(source.QualityWarningsJson),
        };

    private static IReadOnlyList<AiOrderSourceWarningDto> DeserializeWarnings(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try
        {
            return JsonSerializer
                .Deserialize<IReadOnlyList<SourceQualityWarning>>(json)?
                .Select(x => new AiOrderSourceWarningDto
                {
                    Code = x.Code,
                    Message = x.Message,
                })
                .ToArray() ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private async Task DeleteStoredObjectBestEffortAsync(string objectKey)
    {
        try
        {
            // Compensating cleanup must still run after the request token is cancelled.
            await _privateStorage.DeleteAsync(objectKey, CancellationToken.None);
        }
        catch
        {
            _logger.LogError(
                "AI order private object cleanup failed after an intake error.");
        }
    }

    private async Task RecordFailedAccessBestEffortAsync(
        Guid importId,
        Guid documentId,
        Guid actorId,
        AiOrderSourceAccessType accessType,
        string category,
        CancellationToken cancellationToken)
    {
        try
        {
            await _foundation.RecordSourceAccessAsync(
                importId,
                documentId,
                actorId,
                accessType,
                succeeded: false,
                category,
                cancellationToken);
        }
        catch
        {
            _logger.LogWarning(
                "AI order source access audit persistence failed; import {ImportId}; source {SourceDocumentId}; category {FailureCategory}.",
                importId,
                documentId,
                category);
        }
    }

    private Guid RequireAdminId() =>
        CurrentUser.Id ??
        throw Safe(
            AiOrderImportErrorCodes.InvalidRequest,
            "The authenticated Admin identity is unavailable.");

    private static void EnsureModifiable(AiOrderImport import)
    {
        if (!CanModify(import))
            throw Safe(
                AiOrderImportErrorCodes.ModificationNotAllowed,
                "Source documents can be changed only while the import is Uploaded.");
    }

    private static bool CanModify(AiOrderImport import) =>
        import.Status == AiOrderImportStatus.Uploaded &&
        import.ActiveProcessingLeaseToken is null;

    private static string SanitizeOriginalFileName(string value)
    {
        var fileName = Path.GetFileName(value);
        var safe = new string(fileName.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        if (string.IsNullOrWhiteSpace(safe))
            return "source";
        return safe.Length <= 256 ? safe : safe[..256];
    }

    private static string BuildSafeFileName(Guid documentId, string contentType)
    {
        var extension = contentType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "application/pdf" => ".pdf",
            _ => ".bin",
        };
        return $"ai-order-source-{documentId:N}{extension}";
    }

    private static BusinessException Safe(string code, string message) =>
        new(code, message);
}

public sealed record OpenedAiOrderSource(
    Stream Stream,
    string ContentType,
    string SafeFileName);
