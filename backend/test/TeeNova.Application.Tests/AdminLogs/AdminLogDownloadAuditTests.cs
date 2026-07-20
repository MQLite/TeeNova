using Microsoft.Extensions.Logging;

namespace TeeNova.AdminLogs;

public sealed class AdminLogDownloadAuditTests
{
    [Fact]
    public void Audit_is_one_structured_event_with_required_fields_and_no_sensitive_values()
    {
        var logger = new CapturingLogger<AdminLogDownloadAudit>();
        var audit = new AdminLogDownloadAudit(logger);
        const string physicalPath = "C:\\private\\logs\\admin.log";
        const string protectedId = "complete-protected-token";
        const string fileContent = "secret file content";

        audit.Write(new AdminLogDownloadAuditRecord(
            new AdminLogDownloadAuditContext("user-id", "administrator", "correlation-id", "A1B2C3"),
            "Success",
            "api",
            "admin.log",
            123,
            123,
            new DateTimeOffset(2026, 7, 20, 1, 2, 3, TimeSpan.Zero),
            "None",
            200));

        var entry = Assert.Single(logger.Entries);
        Assert.Equal("AdminLogDownload", entry["EventName"]);
        Assert.Equal("Success", entry["Outcome"]);
        Assert.Equal("user-id", entry["AdminUserId"]);
        Assert.Equal("correlation-id", entry["CorrelationId"]);
        Assert.Equal(123L, entry["BytesWritten"]);
        var rendered = string.Join(" ", entry.Values.Select(value => value?.ToString()));
        Assert.DoesNotContain(physicalPath, rendered, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(protectedId, rendered, StringComparison.Ordinal);
        Assert.DoesNotContain(fileContent, rendered, StringComparison.Ordinal);
    }

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<Dictionary<string, object?>> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var values = Assert.IsAssignableFrom<IEnumerable<KeyValuePair<string, object?>>>(state);
            Entries.Add(values.ToDictionary(pair => pair.Key, pair => pair.Value));
        }
    }
}
