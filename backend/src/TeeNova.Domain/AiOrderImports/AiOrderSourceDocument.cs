using System;
using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.AiOrderImports;

public class AiOrderSourceDocument : CreationAuditedEntity<Guid>
{
    public Guid ImportId { get; private set; }
    public int Sequence { get; private set; }
    public AiOrderCaptureMethod CaptureMethod { get; private set; }
    public string PrivateObjectKey { get; private set; } = default!;
    public string ContentType { get; private set; } = default!;
    public long ByteSize { get; private set; }
    public int? PageCount { get; private set; }
    public string Sha256 { get; private set; } = default!;
    public string? OriginalFileName { get; private set; }
    public Guid UploadedByAdminId { get; private set; }
    public DateTime UploadedAt { get; private set; }
    public DateTime? RetentionUntil { get; private set; }
    public DateTime? ContentDeletedAt { get; private set; }
    public AiOrderSourceDeletionOutcome DeletionOutcome { get; private set; }
    public string? SafeDeletionErrorCode { get; private set; }
    public int DeletionFailureCount { get; private set; }
    public DateTime? DeletionNextRetryAt { get; private set; }
    public string? UploadIdempotencyKey { get; private set; }
    public int? ImageWidth { get; private set; }
    public int? ImageHeight { get; private set; }
    public int RotationDegrees { get; private set; }
    public string? QualityWarningsJson { get; private set; }

    protected AiOrderSourceDocument()
    {
    }

    public AiOrderSourceDocument(
        Guid id,
        Guid importId,
        int sequence,
        AiOrderCaptureMethod captureMethod,
        string privateObjectKey,
        string contentType,
        long byteSize,
        int? pageCount,
        string sha256,
        string? originalFileName,
        Guid uploadedByAdminId,
        DateTime uploadedAt,
        DateTime? retentionUntil,
        string? uploadIdempotencyKey = null,
        int? imageWidth = null,
        int? imageHeight = null,
        string? qualityWarningsJson = null)
        : base(id)
    {
        if (importId == Guid.Empty || uploadedByAdminId == Guid.Empty)
            throw new ArgumentException("Non-empty import and actor identifiers are required.");
        if (sequence < 1)
            throw new ArgumentOutOfRangeException(nameof(sequence));
        if (byteSize < 0)
            throw new ArgumentOutOfRangeException(nameof(byteSize));
        if (pageCount is < 1)
            throw new ArgumentOutOfRangeException(nameof(pageCount));

        ImportId = importId;
        Sequence = sequence;
        CaptureMethod = captureMethod;
        PrivateObjectKey = AiOrderImport.EnsureText(privateObjectKey, nameof(privateObjectKey), 160);
        ContentType = AiOrderImport.EnsureText(contentType, nameof(contentType), 128);
        ByteSize = byteSize;
        PageCount = pageCount;
        Sha256 = AiOrderImport.EnsureSha256(sha256, nameof(sha256));
        OriginalFileName = NormalizeOptional(originalFileName, 512, nameof(originalFileName));
        UploadedByAdminId = uploadedByAdminId;
        UploadedAt = uploadedAt;
        RetentionUntil = retentionUntil;
        DeletionOutcome = AiOrderSourceDeletionOutcome.Retained;
        UploadIdempotencyKey = NormalizeOptional(
            uploadIdempotencyKey,
            128,
            nameof(uploadIdempotencyKey));
        if (imageWidth is < 1 || imageHeight is < 1)
            throw new ArgumentOutOfRangeException(nameof(imageWidth));
        if (imageWidth.HasValue != imageHeight.HasValue)
            throw new ArgumentException("Image width and height must both be provided.");
        ImageWidth = imageWidth;
        ImageHeight = imageHeight;
        QualityWarningsJson = string.IsNullOrWhiteSpace(qualityWarningsJson)
            ? null
            : qualityWarningsJson;
    }

    public void MarkContentDeleted(DateTime deletedAt)
    {
        ContentDeletedAt ??= deletedAt;
        DeletionOutcome = AiOrderSourceDeletionOutcome.Deleted;
        SafeDeletionErrorCode = null;
        DeletionNextRetryAt = null;
    }

    public void MarkDeletionFailed(string safeErrorCode, DateTime nextRetryAt)
    {
        if (ContentDeletedAt.HasValue)
            throw new BusinessException("TeeNova:AiOrderImport:SourceAlreadyDeleted");

        DeletionOutcome = AiOrderSourceDeletionOutcome.Failed;
        SafeDeletionErrorCode = AiOrderImport.EnsureText(
            safeErrorCode,
            nameof(safeErrorCode),
            128);
        DeletionFailureCount++;
        DeletionNextRetryAt = nextRetryAt;
    }

    public void SetRetentionUntil(DateTime? retentionUntil)
    {
        RetentionUntil = retentionUntil;
    }

    public void ChangeSequence(int sequence)
    {
        if (ContentDeletedAt.HasValue)
            throw new BusinessException("TeeNova:AiOrderImport:SourceAlreadyDeleted");
        if (sequence < 1)
            throw new ArgumentOutOfRangeException(nameof(sequence));
        Sequence = sequence;
    }

    public void SetRotation(int rotationDegrees)
    {
        if (ContentDeletedAt.HasValue)
            throw new BusinessException("TeeNova:AiOrderImport:SourceAlreadyDeleted");
        if (rotationDegrees is not (0 or 90 or 180 or 270))
            throw new BusinessException("TeeNova:AiOrderImport:InvalidRotation");
        RotationDegrees = rotationDegrees;
    }

    private static string? NormalizeOptional(string? value, int maxLength, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return AiOrderImport.EnsureText(value, name, maxLength);
    }
}
