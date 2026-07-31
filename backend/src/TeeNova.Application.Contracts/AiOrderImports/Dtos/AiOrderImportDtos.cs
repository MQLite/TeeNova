using System;
using System.Collections.Generic;
using System.Text.Json;

namespace TeeNova.AiOrderImports.Dtos;

public sealed class CreateAiOrderImportInput
{
    public string? CaptureSessionId { get; set; }
}

public sealed class ReorderAiOrderDocumentsInput
{
    public IReadOnlyList<Guid> DocumentIds { get; set; } = [];
}

public sealed class SetAiOrderDocumentRotationInput
{
    public int RotationDegrees { get; set; }
}

public sealed class AiOrderImportListResultDto
{
    public IReadOnlyList<AiOrderImportSummaryDto> Items { get; set; } = [];
}

public class AiOrderImportSummaryDto
{
    public Guid Id { get; set; }
    public AiOrderImportStatus Status { get; set; }
    public int CurrentRevision { get; set; }
    public DateTime CreationTime { get; set; }
    public int SourceDocumentCount { get; set; }
    public bool CanModifyDocuments { get; set; }
    public AiOrderRecognitionStatusDto? Recognition { get; set; }
}

public sealed class StartAiOrderRecognitionInput
{
    public string Provider { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
}

public sealed class AiOrderRecognitionOptionsDto
{
    public bool RecognitionEnabled { get; set; }
    public IReadOnlyList<AiOrderRecognitionProviderOptionDto> Providers { get; set; } = [];
}

public sealed class AiOrderRecognitionProviderOptionDto
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public IReadOnlyList<AiOrderRecognitionModelOptionDto> Models { get; set; } = [];
}

public sealed class AiOrderRecognitionModelOptionDto
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool SupportsImages { get; set; }
    public bool SupportsPdf { get; set; }
}

public sealed class AiOrderRecognitionStatusDto
{
    public Guid AttemptId { get; set; }
    public int AttemptNumber { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public AiOrderProcessingAttemptOutcome Outcome { get; set; }
    public DateTime SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? SafeErrorCode { get; set; }
    public bool? IsRetryable { get; set; }
    public DateTime? NextRetryAt { get; set; }
    public long? InputTokens { get; set; }
    public long? OutputTokens { get; set; }
    public decimal? EstimatedCostUsd { get; set; }
    public decimal? ActualCostUsd { get; set; }
}

public sealed class AiOrderImportDto : AiOrderImportSummaryDto
{
    public IReadOnlyList<AiOrderSourceDocumentDto> SourceDocuments { get; set; } = [];
    public bool CanContinueToRecognition { get; set; }
}

public sealed class AiOrderSourceDocumentDto
{
    public Guid Id { get; set; }
    public int Sequence { get; set; }
    public AiOrderCaptureMethod CaptureMethod { get; set; }
    public string? OriginalFileName { get; set; }
    public string ContentType { get; set; } = default!;
    public long ByteSize { get; set; }
    public int? PageCount { get; set; }
    public int? ImageWidth { get; set; }
    public int? ImageHeight { get; set; }
    public int RotationDegrees { get; set; }
    public DateTime UploadedAt { get; set; }
    public IReadOnlyList<AiOrderSourceWarningDto> Warnings { get; set; } = [];
}

public sealed class AiOrderSourceUploadResultDto
{
    public AiOrderSourceDocumentDto Document { get; set; } = default!;
    public bool WasIdempotentReplay { get; set; }
    public IReadOnlyList<Guid> PossibleMatchingImportIds { get; set; } = [];
}

public sealed class AiOrderSourceWarningDto
{
    public string Code { get; set; } = default!;
    public string Message { get; set; } = default!;
}

public sealed class AiOrderReviewDto
{
    public Guid ImportId { get; set; }
    public AiOrderImportStatus Status { get; set; }
    public int CurrentRevision { get; set; }
    public int BaseRevision { get; set; }
    public string ReviewVersion { get; set; } = string.Empty;
    public bool HasStaffRevision { get; set; }
    public int ValidationRevision { get; set; }
    public Guid ValidationRevisionId { get; set; }
    public string ValidationVersion { get; set; } = string.Empty;
    public int SourceAiRevision { get; set; }
    public string CanonicalSha256 { get; set; } = string.Empty;
    public string CatalogueValidationStatus { get; set; } = string.Empty;
    public DateTime CatalogueValidatedAt { get; set; }
    public bool RequiresRevalidation { get; set; }
    public int IssueCount { get; set; }
    public int BlockingIssueCount { get; set; }
    public int WarningCount { get; set; }
    public JsonElement Customer { get; set; }
    public JsonElement ProductGroups { get; set; }
    public JsonElement Financials { get; set; }
    public JsonElement Issues { get; set; }
    public JsonElement IssueResolutions { get; set; }
    public JsonElement ConfirmationReadiness { get; set; }
    public DateTime? LastSavedAt { get; set; }
    public AiOrderReviewProviderSummaryDto? Processing { get; set; }
}

public sealed class AiOrderReviewProviderSummaryDto
{
    public string Provider { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string PromptVersion { get; set; } = string.Empty;
}
