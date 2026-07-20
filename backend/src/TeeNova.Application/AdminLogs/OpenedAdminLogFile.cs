using System;
using System.IO;
using System.Threading.Tasks;

namespace TeeNova.AdminLogs;

public sealed class OpenedAdminLogFile : IAsyncDisposable
{
    public OpenedAdminLogFile(
        Stream stream,
        string safeFileName,
        string sourceKey,
        long snapshotLength,
        DateTime lastModifiedUtc,
        AdminLogDownloadAuditContext auditContext)
    {
        if (!AdminLogFileIdProtector.IsSafeBasename(safeFileName))
            throw new ArgumentException("A safe basename is required.", nameof(safeFileName));
        if (snapshotLength < 0)
            throw new ArgumentOutOfRangeException(nameof(snapshotLength));

        Stream = stream;
        SafeFileName = safeFileName;
        SourceKey = sourceKey;
        SnapshotLength = snapshotLength;
        LastModifiedUtc = lastModifiedUtc;
        AuditContext = auditContext;
    }

    public Stream Stream { get; }
    public string SafeFileName { get; }
    public string SourceKey { get; }
    public long SnapshotLength { get; }
    public DateTime LastModifiedUtc { get; }
    public AdminLogDownloadAuditContext AuditContext { get; }

    public ValueTask DisposeAsync() => Stream.DisposeAsync();
}
