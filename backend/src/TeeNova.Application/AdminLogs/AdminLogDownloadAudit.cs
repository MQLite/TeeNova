using System;
using Microsoft.Extensions.Logging;

namespace TeeNova.AdminLogs;

public sealed record AdminLogDownloadAuditContext(
    string? AdminUserId,
    string AdminUsername,
    string CorrelationId,
    string FileReference);

public sealed record AdminLogDownloadAuditRecord(
    AdminLogDownloadAuditContext Context,
    string Outcome,
    string SourceKey,
    string SafeFileName,
    long SnapshotLength,
    long BytesWritten,
    DateTimeOffset UtcTimestamp,
    string FailureCategory,
    int HttpStatus);

public interface IAdminLogDownloadAudit
{
    void Write(AdminLogDownloadAuditRecord record);
}

public sealed class AdminLogDownloadAudit : IAdminLogDownloadAudit
{
    private readonly ILogger<AdminLogDownloadAudit> _logger;

    public AdminLogDownloadAudit(ILogger<AdminLogDownloadAudit> logger)
    {
        _logger = logger;
    }

    public void Write(AdminLogDownloadAuditRecord record)
    {
        _logger.LogInformation(
            "{EventName} outcome {Outcome}; admin user id {AdminUserId}; admin username {AdminUsername}; source {SourceKey}; file {SafeFileName}; file reference {FileReference}; snapshot length {SnapshotLength}; bytes written {BytesWritten}; UTC timestamp {UtcTimestamp}; correlation {CorrelationId}; failure category {FailureCategory}; HTTP status {HttpStatus}.",
            "AdminLogDownload",
            record.Outcome,
            record.Context.AdminUserId ?? "unavailable",
            record.Context.AdminUsername,
            record.SourceKey,
            record.SafeFileName,
            record.Context.FileReference,
            record.SnapshotLength,
            record.BytesWritten,
            record.UtcTimestamp,
            record.Context.CorrelationId,
            record.FailureCategory,
            record.HttpStatus);
    }
}
