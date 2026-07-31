namespace TeeNova.AiOrderImports;

public enum AiOrderImportStatus
{
    Uploaded,
    Processing,
    NeedsReview,
    Draft,
    Confirmed,
    Failed,
    Cancelled,
}

public enum AiOrderCaptureMethod
{
    Camera,
    Upload,
}

public enum AiOrderProcessingAttemptOutcome
{
    Processing,
    Succeeded,
    RetryableFailure,
    PermanentFailure,
    Cancelled,
}

public enum AiOrderRevisionSource
{
    AI,
    Staff,
    Validation,
    Confirmation,
}

public enum AiOrderReviewAction
{
    Created,
    Accepted,
    Corrected,
    Cleared,
    CandidateSelected,
    IssueResolved,
    GroupAdded,
    GroupRemoved,
    GroupMerged,
    GroupSplit,
    GroupDuplicated,
    GroupReordered,
    RowAdded,
    RowRemoved,
    RowMerged,
    DraftSaved,
    Confirmed,
    Cancelled,
    ValidationFailed,
}

public enum AiOrderSourceDeletionOutcome
{
    Retained,
    Deleted,
    Failed,
}

public enum PrivateObjectCategory
{
    SourceDocument,
    RawProviderEvidence,
}

public enum AiOrderSourceAccessType
{
    InlineView,
    Download,
}
