using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;

namespace TeeNova.AdminLogs;

public sealed class AdminLogDownloadResultTests
{
    [Fact]
    public async Task Success_streams_exact_snapshot_in_bounded_chunks_with_safe_headers_and_one_audit()
    {
        var content = new byte[AdminLogDownloadResult.BufferSize * 3];
        for (var index = 0; index < content.Length; index++)
            content[index] = (byte)(index % 251);
        var input = new TrackingReadStream(content);
        var output = new RecordingWriteStream();
        var audit = new CapturingAudit();
        var context = Context(output);
        var file = Opened(input, "应用-日志.log", content.Length);

        await new AdminLogDownloadResult(file, audit, TimeProvider.System)
            .ExecuteResultAsync(context);

        Assert.Equal(content, output.Bytes);
        Assert.True(input.MaximumReadRequest <= AdminLogDownloadResult.BufferSize);
        Assert.True(output.MaximumWrite <= AdminLogDownloadResult.BufferSize);
        Assert.True(input.Disposed);
        Assert.Equal(StatusCodes.Status200OK, context.HttpContext.Response.StatusCode);
        Assert.Equal(content.Length, context.HttpContext.Response.ContentLength);
        Assert.Equal("application/octet-stream", context.HttpContext.Response.ContentType);
        Assert.Equal("no-store", context.HttpContext.Response.Headers.CacheControl);
        Assert.Equal("nosniff", context.HttpContext.Response.Headers.XContentTypeOptions);
        Assert.Equal("no", context.HttpContext.Response.Headers["X-Accel-Buffering"]);
        var disposition = context.HttpContext.Response.Headers.ContentDisposition.ToString();
        Assert.StartsWith("attachment", disposition, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("filename*=", disposition, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Accept-Ranges", context.HttpContext.Response.Headers.Keys);
        var record = Assert.Single(audit.Records);
        Assert.Equal("Success", record.Outcome);
        Assert.Equal(content.Length, record.BytesWritten);
        Assert.Equal("correlation", record.Context.CorrelationId);
        Assert.Equal("admin", record.Context.AdminUsername);
    }

    [Fact]
    public async Task Append_during_stream_does_not_extend_captured_snapshot()
    {
        var input = new TrackingReadStream(Encoding.UTF8.GetBytes("before"));
        input.OnFirstRead = () => input.Append(Encoding.UTF8.GetBytes("-after"));
        var output = new RecordingWriteStream();
        var audit = new CapturingAudit();

        await new AdminLogDownloadResult(Opened(input, "active.log", 6), audit, TimeProvider.System)
            .ExecuteResultAsync(Context(output));

        Assert.Equal("before", Encoding.UTF8.GetString(output.Bytes));
        Assert.Equal(6, Assert.Single(audit.Records).SnapshotLength);
    }

    [Fact]
    public async Task Active_test_log_audit_append_does_not_extend_download_snapshot()
    {
        var path = Path.Combine(Path.GetTempPath(), $"teenova-active-log-{Guid.NewGuid():N}.log");
        var snapshot = Encoding.UTF8.GetBytes("before");
        try
        {
            await File.WriteAllBytesAsync(path, snapshot);
            var input = new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete,
                AdminLogDownloadResult.BufferSize,
                FileOptions.SequentialScan);
            var output = new RecordingWriteStream();
            var audit = new AdminLogDownloadAudit(new AppendingFileLogger(path));

            await new AdminLogDownloadResult(Opened(input, "active-test.log", snapshot.Length), audit, TimeProvider.System)
                .ExecuteResultAsync(Context(output));

            Assert.Equal(snapshot, output.Bytes);
            Assert.Equal(snapshot.Length, output.Bytes.Length);
            var finalContent = await File.ReadAllTextAsync(path);
            Assert.StartsWith("before", finalContent, StringComparison.Ordinal);
            Assert.Contains("AdminLogDownload", finalContent, StringComparison.Ordinal);
            Assert.True(new FileInfo(path).Length > snapshot.Length);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task Premature_eof_aborts_as_one_failure_and_disposes_input()
    {
        var input = new TrackingReadStream(Encoding.UTF8.GetBytes("short"));
        var audit = new CapturingAudit();

        await new AdminLogDownloadResult(
                Opened(input, "truncated.log", 20), audit, TimeProvider.System)
            .ExecuteResultAsync(Context(new RecordingWriteStream()));

        Assert.True(input.Disposed);
        var record = Assert.Single(audit.Records);
        Assert.Equal("Failed", record.Outcome);
        Assert.Equal("StreamingFailure", record.FailureCategory);
        Assert.Equal(5, record.BytesWritten);
    }

    [Fact]
    public async Task Physical_truncation_during_stream_aborts_as_one_failure_and_disposes_input()
    {
        var path = Path.Combine(Path.GetTempPath(), $"teenova-truncate-{Guid.NewGuid():N}.log");
        try
        {
            var snapshotLength = AdminLogDownloadResult.BufferSize * 2L;
            using (var creator = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
                creator.SetLength(snapshotLength);

            var input = new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete,
                AdminLogDownloadResult.BufferSize,
                FileOptions.SequentialScan);
            var output = new RecordingWriteStream
            {
                OnFirstWrite = () =>
                {
                    using var truncator = new FileStream(
                        path,
                        FileMode.Open,
                        FileAccess.Write,
                        FileShare.ReadWrite | FileShare.Delete);
                    truncator.SetLength(1);
                },
            };
            var audit = new CapturingAudit();

            await new AdminLogDownloadResult(
                    Opened(input, "physically-truncated.log", snapshotLength), audit, TimeProvider.System)
                .ExecuteResultAsync(Context(output));

            Assert.False(input.CanRead);
            Assert.InRange(output.Bytes.LongLength, 1, snapshotLength - 1);
            var record = Assert.Single(audit.Records);
            Assert.Equal("Failed", record.Outcome);
            Assert.Equal("StreamingFailure", record.FailureCategory);
            Assert.Equal(output.Bytes.LongLength, record.BytesWritten);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task Cancellation_before_streaming_disposes_without_reading_and_audits_once()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var input = new TrackingReadStream(new byte[100]);
        var output = new RecordingWriteStream();
        var audit = new CapturingAudit();
        var context = Context(output);
        context.HttpContext.RequestAborted = cancellation.Token;

        await new AdminLogDownloadResult(Opened(input, "cancel-before-stream.log", 100), audit, TimeProvider.System)
            .ExecuteResultAsync(context);

        Assert.True(input.Disposed);
        Assert.Equal(0, input.MaximumReadRequest);
        Assert.Empty(output.Bytes);
        var record = Assert.Single(audit.Records);
        Assert.Equal("Cancelled", record.Outcome);
        Assert.Equal(499, record.HttpStatus);
        Assert.Equal(0, record.BytesWritten);
    }

    [Fact]
    public async Task Client_cancellation_stops_streaming_disposes_and_audits_once()
    {
        using var cancellation = new CancellationTokenSource();
        var input = new TrackingReadStream(new byte[100]);
        input.OnFirstRead = cancellation.Cancel;
        var audit = new CapturingAudit();
        var context = Context(new RecordingWriteStream());
        context.HttpContext.RequestAborted = cancellation.Token;

        await new AdminLogDownloadResult(Opened(input, "cancel.log", 100), audit, TimeProvider.System)
            .ExecuteResultAsync(context);

        Assert.True(input.Disposed);
        var record = Assert.Single(audit.Records);
        Assert.Equal("Cancelled", record.Outcome);
        Assert.Equal(499, record.HttpStatus);
    }

    [Fact]
    public async Task Midstream_read_or_write_failure_is_one_failure_and_disposes()
    {
        var failedInput = new TrackingReadStream(new byte[10]) { ThrowOnRead = true };
        var readAudit = new CapturingAudit();
        await new AdminLogDownloadResult(Opened(failedInput, "read.log", 10), readAudit, TimeProvider.System)
            .ExecuteResultAsync(Context(new RecordingWriteStream()));
        Assert.True(failedInput.Disposed);
        Assert.Equal("Failed", Assert.Single(readAudit.Records).Outcome);

        var writeInput = new TrackingReadStream(new byte[10]);
        var writeAudit = new CapturingAudit();
        await new AdminLogDownloadResult(Opened(writeInput, "write.log", 10), writeAudit, TimeProvider.System)
            .ExecuteResultAsync(Context(new RecordingWriteStream { ThrowOnWrite = true }));
        Assert.True(writeInput.Disposed);
        Assert.Equal("Failed", Assert.Single(writeAudit.Records).Outcome);
    }

    [Fact]
    public async Task Disposal_failure_still_records_exactly_one_failure_outcome()
    {
        var input = new TrackingReadStream(new byte[1]) { ThrowOnDispose = true };
        var audit = new CapturingAudit();

        await new AdminLogDownloadResult(Opened(input, "dispose.log", 1), audit, TimeProvider.System)
            .ExecuteResultAsync(Context(new RecordingWriteStream()));

        Assert.True(input.Disposed);
        var record = Assert.Single(audit.Records);
        Assert.Equal("Failed", record.Outcome);
        Assert.Equal("DisposalFailure", record.FailureCategory);
    }

    [Theory]
    [InlineData("bad\r\nInjected: value.log")]
    [InlineData("folder/file.log")]
    [InlineData("bad\0.log")]
    public void Unsafe_filename_cannot_enter_result(string fileName)
    {
        Assert.Throws<ArgumentException>(() => Opened(new TrackingReadStream([]), fileName, 0));
    }

    private static OpenedAdminLogFile Opened(Stream stream, string name, long length)
        => new(
            stream,
            name,
            "api",
            length,
            DateTime.UtcNow,
            new AdminLogDownloadAuditContext("admin-id", "admin", "correlation", "ABC123"));

    private static ActionContext Context(Stream responseBody)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = responseBody;
        httpContext.TraceIdentifier = "correlation";
        return new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
    }

    private sealed class CapturingAudit : IAdminLogDownloadAudit
    {
        public List<AdminLogDownloadAuditRecord> Records { get; } = [];
        public void Write(AdminLogDownloadAuditRecord record) => Records.Add(record);
    }

    private sealed class AppendingFileLogger(string path) : ILogger<AdminLogDownloadAudit>
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            File.AppendAllText(path, Environment.NewLine + formatter(state, exception));
        }
    }

    private sealed class TrackingReadStream : Stream
    {
        private byte[] _content;
        private int _position;
        private bool _firstRead = true;

        public TrackingReadStream(byte[] content) => _content = content;

        public Action? OnFirstRead { get; set; }
        public bool ThrowOnRead { get; set; }
        public bool ThrowOnDispose { get; set; }
        public bool Disposed { get; private set; }
        public int MaximumReadRequest { get; private set; }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => _content.Length;
        public override long Position { get => _position; set => throw new NotSupportedException(); }

        public void Append(byte[] bytes)
        {
            var combined = new byte[_content.Length + bytes.Length];
            _content.CopyTo(combined, 0);
            bytes.CopyTo(combined, _content.Length);
            _content = combined;
        }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            MaximumReadRequest = Math.Max(MaximumReadRequest, buffer.Length);
            if (_firstRead)
            {
                _firstRead = false;
                OnFirstRead?.Invoke();
            }
            cancellationToken.ThrowIfCancellationRequested();
            if (ThrowOnRead)
                throw new IOException("Synthetic read failure.");

            var count = Math.Min(buffer.Length, _content.Length - _position);
            _content.AsMemory(_position, count).CopyTo(buffer);
            _position += count;
            return ValueTask.FromResult(count);
        }

        protected override void Dispose(bool disposing)
        {
            Disposed = true;
            if (ThrowOnDispose)
                throw new IOException("Synthetic disposal failure.");
            base.Dispose(disposing);
        }

        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    private sealed class RecordingWriteStream : Stream
    {
        private readonly List<byte> _bytes = [];
        private bool _firstWrite = true;
        public byte[] Bytes => [.. _bytes];
        public Action? OnFirstWrite { get; set; }
        public int MaximumWrite { get; private set; }
        public bool ThrowOnWrite { get; set; }
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => _bytes.Count;
        public override long Position { get => _bytes.Count; set => throw new NotSupportedException(); }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (ThrowOnWrite)
                throw new IOException("Synthetic write failure.");
            if (_firstWrite)
            {
                _firstWrite = false;
                OnFirstWrite?.Invoke();
            }
            MaximumWrite = Math.Max(MaximumWrite, buffer.Length);
            foreach (var value in buffer.Span)
                _bytes.Add(value);
            return ValueTask.CompletedTask;
        }

        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
