namespace TeeNova.Enquiries;

public sealed class QuoteRequestOptions
{
    public const string SectionName = "QuoteRequests";
    public bool Enabled { get; set; }
    public int MaxAttachments { get; set; } = 5;
    public long MaxAttachmentBytes { get; set; } = 20 * 1024 * 1024;
    public long MaxTotalAttachmentBytes { get; set; } = 60 * 1024 * 1024;
    public string[] AllowedExtensions { get; set; } = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".ai"];
    public int AttachmentStagingMinutes { get; set; } = 60;
    public int DuplicateWindowMinutes { get; set; } = 10;
    public int MinimumSubmitSeconds { get; set; } = 3;
    public int? RetentionDays { get; set; }
    public string ReferencePrefix { get; set; } = "QR";
    public string? IpHashKey { get; set; }
}

public sealed class QuotePrivateStorageOptions
{
    public const string SectionName = "QuotePrivateStorage";
    public string RootPath { get; set; } = "App_Data/private/quote-requests";
    public long MinimumFreeSpaceBytes { get; set; } = 1_073_741_824;
    public string[] ForbiddenPathPrefixes { get; set; } = ["wwwroot"];
}
