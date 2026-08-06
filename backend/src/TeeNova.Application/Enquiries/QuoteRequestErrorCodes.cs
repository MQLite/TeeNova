namespace TeeNova.Enquiries;

public static class QuoteRequestErrorCodes
{
    public const string Disabled = "TeeNova:QuoteRequests:Disabled";
    public const string InvalidRequest = "TeeNova:QuoteRequests:InvalidRequest";
    public const string SpamRejected = "TeeNova:QuoteRequests:SpamRejected";
    public const string SubmittedTooQuickly = "TeeNova:QuoteRequests:SubmittedTooQuickly";
    public const string AttachmentInvalid = "TeeNova:QuoteRequests:AttachmentInvalid";
    public const string AttachmentExpired = "TeeNova:QuoteRequests:AttachmentExpired";
    public const string AttachmentConflict = "TeeNova:QuoteRequests:AttachmentConflict";
    public const string IdempotencyConflict = "TeeNova:QuoteRequests:IdempotencyConflict";
    public const string InvalidTransition = "TeeNova:QuoteRequests:InvalidTransition";
}
