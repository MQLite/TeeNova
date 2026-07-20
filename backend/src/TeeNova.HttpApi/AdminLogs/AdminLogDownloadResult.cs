using System;
using System.Buffers;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace TeeNova.AdminLogs;

public sealed class AdminLogDownloadResult : IActionResult
{
    public const int BufferSize = 64 * 1024;

    private readonly OpenedAdminLogFile _file;
    private readonly IAdminLogDownloadAudit _audit;
    private readonly TimeProvider _timeProvider;

    public AdminLogDownloadResult(
        OpenedAdminLogFile file,
        IAdminLogDownloadAudit audit,
        TimeProvider timeProvider)
    {
        _file = file;
        _audit = audit;
        _timeProvider = timeProvider;
    }

    public async Task ExecuteResultAsync(ActionContext context)
    {
        var response = context.HttpContext.Response;
        var cancellationToken = context.HttpContext.RequestAborted;
        var bytesWritten = 0L;
        var outcome = "Failed";
        var failureCategory = "StreamingFailure";
        var httpStatus = StatusCodes.Status500InternalServerError;
        byte[]? buffer = null;

        try
        {
            response.StatusCode = StatusCodes.Status200OK;
            response.ContentType = "application/octet-stream";
            response.ContentLength = _file.SnapshotLength;
            response.Headers.CacheControl = "no-store";
            response.Headers[HeaderNames.XContentTypeOptions] = "nosniff";
            response.Headers["X-Accel-Buffering"] = "no";

            var disposition = new ContentDispositionHeaderValue("attachment");
            disposition.SetHttpFileName(_file.SafeFileName);
            response.Headers.ContentDisposition = disposition.ToString();

            buffer = ArrayPool<byte>.Shared.Rent(BufferSize);
            var remaining = _file.SnapshotLength;
            while (remaining > 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var requested = (int)Math.Min(buffer.Length, remaining);
                var read = await _file.Stream.ReadAsync(buffer.AsMemory(0, requested), cancellationToken);
                if (read == 0)
                    throw new EndOfStreamException("The admin log snapshot ended before its captured length.");

                await response.Body.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                bytesWritten += read;
                remaining -= read;
            }

            outcome = "Success";
            failureCategory = "None";
            httpStatus = StatusCodes.Status200OK;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            outcome = "Cancelled";
            failureCategory = "ClientCancellation";
            httpStatus = 499;
            context.HttpContext.Abort();
        }
        catch (Exception) when (cancellationToken.IsCancellationRequested)
        {
            outcome = "Cancelled";
            failureCategory = "ClientCancellation";
            httpStatus = 499;
            context.HttpContext.Abort();
        }
        catch (Exception)
        {
            context.HttpContext.Abort();
        }
        finally
        {
            if (buffer is not null)
                ArrayPool<byte>.Shared.Return(buffer);

            try
            {
                await _file.DisposeAsync();
            }
            catch (Exception)
            {
                outcome = "Failed";
                failureCategory = "DisposalFailure";
                httpStatus = StatusCodes.Status500InternalServerError;
                context.HttpContext.Abort();
            }
            finally
            {
                _audit.Write(new AdminLogDownloadAuditRecord(
                    _file.AuditContext,
                    outcome,
                    _file.SourceKey,
                    _file.SafeFileName,
                    _file.SnapshotLength,
                    bytesWritten,
                    _timeProvider.GetUtcNow(),
                    failureCategory,
                    httpStatus));
            }
        }
    }
}
