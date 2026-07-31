namespace TeeNova.AiOrderImports;

public static class AiOrderImportErrorCodes
{
    public const string InvalidRequest = "TeeNova:AiOrderImport:InvalidRequest";
    public const string IdempotencyKeyRequired = "TeeNova:AiOrderImport:IdempotencyKeyRequired";
    public const string IdempotencyHashConflict = "TeeNova:AiOrderImport:IdempotencyHashConflict";
    public const string UploadIdempotencyConflict = "TeeNova:AiOrderImport:UploadIdempotencyConflict";
    public const string ImportNotFound = "TeeNova:AiOrderImport:ImportNotFound";
    public const string SourceNotFound = "TeeNova:AiOrderImport:SourceNotFound";
    public const string SourceContentDeleted = "TeeNova:AiOrderImport:SourceContentDeleted";
    public const string ModificationNotAllowed = "TeeNova:AiOrderImport:ModificationNotAllowed";
    public const string InvalidDocumentOrder = "TeeNova:AiOrderImport:InvalidDocumentOrder";
    public const string UnsupportedFileType = "TeeNova:AiOrderImport:UnsupportedFileType";
    public const string FileTypeMismatch = "TeeNova:AiOrderImport:FileTypeMismatch";
    public const string EmptyFile = "TeeNova:AiOrderImport:EmptyFile";
    public const string FileTooLarge = "TeeNova:AiOrderImport:FileTooLarge";
    public const string TooManyDocuments = "TeeNova:AiOrderImport:TooManyDocuments";
    public const string TotalBytesExceeded = "TeeNova:AiOrderImport:TotalBytesExceeded";
    public const string InvalidSourceContent = "TeeNova:AiOrderImport:InvalidSourceContent";
    public const string PdfPageLimitExceeded = "TeeNova:AiOrderImport:PdfPageLimitExceeded";
    public const string ImageDimensionsExceeded = "TeeNova:AiOrderImport:ImageDimensionsExceeded";
    public const string PrivateStorageFailure = "TeeNova:AiOrderImport:PrivateStorageFailure";
    public const string DatabaseMetadataFailure = "TeeNova:AiOrderImport:DatabaseMetadataFailure";
    public const string RecognitionOptionNotEnabled = "TeeNova:AiOrderImport:RecognitionOptionNotEnabled";
    public const string RecognitionRequiresSources = "TeeNova:AiOrderImport:RecognitionRequiresSources";
    public const string RecognitionSourceLimitExceeded = "TeeNova:AiOrderImport:RecognitionSourceLimitExceeded";
    public const string RecognitionSourceUnsupported = "TeeNova:AiOrderImport:RecognitionSourceUnsupported";
    public const string RecognitionSourceSnapshotChanged = "TeeNova:AiOrderImport:RecognitionSourceSnapshotChanged";
    public const string RecognitionStartConflict = "TeeNova:AiOrderImport:RecognitionStartConflict";
    public const string RecognitionStartNotAllowed = "TeeNova:AiOrderImport:RecognitionStartNotAllowed";
    public const string RecognitionAttemptLimitExceeded = "TeeNova:AiOrderImport:RecognitionAttemptLimitExceeded";
    public const string RecognitionAttemptBudgetExceeded = "TeeNova:AiOrderImport:RecognitionAttemptBudgetExceeded";
    public const string RecognitionMonthlyBudgetExceeded = "TeeNova:AiOrderImport:RecognitionMonthlyBudgetExceeded";
    public const string RecognitionRetryNotReady = "TeeNova:AiOrderImport:RecognitionRetryNotReady";
    public const string ValidationNotAvailable = "TeeNova:AiOrderImport:ValidationNotAvailable";
    public const string ValidationNotAllowed = "TeeNova:AiOrderImport:ValidationNotAllowed";
    public const string ReviewNotAllowed = "TeeNova:AiOrderImport:ReviewNotAllowed";
    public const string ReviewRevisionConflict = "TeeNova:AiOrderImport:ReviewRevisionConflict";
    public const string ReviewVersionUnsupported = "TeeNova:AiOrderImport:ReviewVersionUnsupported";
    public const string ReviewDocumentInvalid = "TeeNova:AiOrderImport:ReviewDocumentInvalid";
    public const string ReviewReasonRequired = "TeeNova:AiOrderImport:ReviewReasonRequired";
    public const string CatalogueSelectionInvalid = "TeeNova:AiOrderImport:CatalogueSelectionInvalid";
    public const string VariantSelectionInvalid = "TeeNova:AiOrderImport:VariantSelectionInvalid";
}
