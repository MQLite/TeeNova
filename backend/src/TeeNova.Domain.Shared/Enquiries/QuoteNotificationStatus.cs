namespace TeeNova.Enquiries;

public enum QuoteNotificationStatus
{
    NotAttempted = 0,
    Sent = 1,
    Failed = 2,
}

public enum QuoteAttachmentScanStatus
{
    NotScanned = 0,
    Clean = 1,
    Rejected = 2,
}

public enum QuoteDimensionUnit
{
    Millimetres = 0,
    Centimetres = 1,
    Metres = 2,
}
