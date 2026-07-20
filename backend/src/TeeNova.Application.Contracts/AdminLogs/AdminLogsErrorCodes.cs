namespace TeeNova.AdminLogs;

public static class AdminLogsErrorCodes
{
    public const string Disabled = "TeeNova:AdminLogs:Disabled";
    public const string SourceNotFound = "TeeNova:AdminLogs:SourceNotFound";
    public const string SourceUnavailable = "TeeNova:AdminLogs:SourceUnavailable";
    public const string InvalidQuery = "TeeNova:AdminLogs:InvalidQuery";
    public const string FileUnavailable = "TeeNova:AdminLogs:FileUnavailable";
    public const string FileIdExpired = "TeeNova:AdminLogs:FileIdExpired";
    public const string FileChanged = "TeeNova:AdminLogs:FileChanged";
    public const string FileTooLarge = "TeeNova:AdminLogs:FileTooLarge";
}
