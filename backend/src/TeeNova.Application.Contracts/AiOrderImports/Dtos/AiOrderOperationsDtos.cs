namespace TeeNova.AiOrderImports.Dtos;

public sealed class AiOrderFeatureStatusDto
{
    public bool Enabled { get; set; }
    public bool IntakeEnabled { get; set; }
    public bool RecognitionEnabled { get; set; }
    public bool ReviewEnabled { get; set; }
    public bool ConfirmationEnabled { get; set; }
    public bool MaterializationEnabled { get; set; }
}

public sealed class AiOrderProviderReadinessDto
{
    public string Provider { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string PrivacyApprovalStatus { get; set; } = string.Empty;
    public string ApprovedEnvironment { get; set; } = string.Empty;
    public DateTime? PrivacyApprovalDate { get; set; }
    public string? ApproverNote { get; set; }
    public string? DataUsePolicyReference { get; set; }
    public string? AllowedDocumentClassification { get; set; }
    public IReadOnlyList<string> EnabledModels { get; set; } = [];
    public decimal MaximumMonthlyCostUsd { get; set; }
    public int MaximumDailyCalls { get; set; }
    public DateTime? LastSanitizedSmokeTestAt { get; set; }
    public bool LastSanitizedSmokeTestSucceeded { get; set; }
}

public sealed class AiOrderMigrationReadinessDto
{
    public IReadOnlyList<string> ExpectedMigrationIds { get; set; } = [];
    public IReadOnlyList<string> AppliedExpectedMigrationIds { get; set; } = [];
    public bool RuntimeSchemaCurrent { get; set; }
    public string Status { get; set; } = string.Empty;
}

public sealed class AiOrderOperationsStatusDto
{
    public string Environment { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; }
    public string OverallStatus { get; set; } = string.Empty;
    public AiOrderFeatureStatusDto Features { get; set; } = new();
    public AiOrderMigrationReadinessDto Migrations { get; set; } = new();
    public string PrivateStorageStatus { get; set; } = string.Empty;
    public long? PrivateStorageAvailableBytes { get; set; }
    public IReadOnlyList<AiOrderProviderReadinessDto> Providers { get; set; } = [];
    public int QueuedRecognitionJobs { get; set; }
    public int ActiveRecognitionLeases { get; set; }
    public int ExpiredOrStuckLeases { get; set; }
    public int RetryableFailures { get; set; }
    public int DeletionBacklog { get; set; }
    public int FailedDeletionCount { get; set; }
    public int ActiveRetentionHolds { get; set; }
    public int SourceAccessesLast24Hours { get; set; }
    public int DeniedSourceAccessesLast24Hours { get; set; }
    public int CurrentMonthProviderCalls { get; set; }
    public decimal CurrentMonthEstimatedCostUsd { get; set; }
    public decimal CurrentMonthActualCostUsd { get; set; }
    public decimal MaximumMonthlyTotalCostUsd { get; set; }
    public DateTime? LastRetentionWorkerRunAt { get; set; }
    public string? LastRetentionWorkerOutcome { get; set; }
    public IReadOnlyList<string> Warnings { get; set; } = [];
    public IReadOnlyList<string> Blockers { get; set; } = [];
}

public sealed class AiOrderRetentionSummaryDto
{
    public Guid ImportId { get; set; }
    public string RetentionClass { get; set; } = string.Empty;
    public DateTime? RetentionUntil { get; set; }
    public bool HoldActive { get; set; }
    public string? HoldReason { get; set; }
    public DateTime? HoldExpiresAt { get; set; }
    public int ActiveSourceCount { get; set; }
    public int RawEvidenceCount { get; set; }
    public int FailedDeletionCount { get; set; }
}

public sealed class PlaceAiOrderRetentionHoldInput
{
    public string Reason { get; set; } = string.Empty;
    public DateTime? ExpiresAt { get; set; }
}

public sealed class ReleaseAiOrderRetentionHoldInput
{
    public string Reason { get; set; } = string.Empty;
}

public sealed class ExtendAiOrderRetentionInput
{
    public string Reason { get; set; } = string.Empty;
    public DateTime RetainUntil { get; set; }
}

public sealed class DeleteAiOrderRetainedBytesInput
{
    public string Reason { get; set; } = string.Empty;
    public bool Confirmed { get; set; }
    public Guid? SourceDocumentId { get; set; }
    public Guid? ProcessingAttemptId { get; set; }
}
