using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Volo.Abp;

namespace TeeNova.AdminLogs;

public interface IAdminLogDownloadService
{
    Task<OpenedAdminLogFile> PrepareAsync(string fileId);
}

public sealed class AdminLogDownloadService : IAdminLogDownloadService
{
    private readonly AdminLogsOptions _options;
    private readonly IAdminLogFileIdProtector _protector;
    private readonly IAdminLogFileOpener _opener;
    private readonly IAdminLogDownloadAudit _audit;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly TimeProvider _timeProvider;

    public AdminLogDownloadService(
        IOptions<AdminLogsOptions> options,
        IAdminLogFileIdProtector protector,
        IAdminLogFileOpener opener,
        IAdminLogDownloadAudit audit,
        IHttpContextAccessor httpContextAccessor,
        TimeProvider timeProvider)
    {
        _options = options.Value;
        _protector = protector;
        _opener = opener;
        _audit = audit;
        _httpContextAccessor = httpContextAccessor;
        _timeProvider = timeProvider;
    }

    public Task<OpenedAdminLogFile> PrepareAsync(string fileId)
    {
        var auditContext = CreateAuditContext(fileId);

        if (!_options.Enabled)
            throw Failed(AdminLogsErrorCodes.Disabled, "Log downloads are disabled.", "FeatureDisabled", 503, auditContext);

        if (!_protector.TryUnprotect(fileId, out var claim, out var tokenFailure))
        {
            if (tokenFailure == AdminLogFileIdFailure.Expired)
                throw Failed(AdminLogsErrorCodes.FileIdExpired, "The log file ID has expired.", "FileIdExpired", 410, auditContext);

            throw Failed(AdminLogsErrorCodes.FileUnavailable, "The requested log file is unavailable.", "InvalidFileId", 404, auditContext);
        }

        var source = _options.Sources.SingleOrDefault(item =>
            string.Equals(item.Key, claim!.SourceKey, StringComparison.Ordinal));
        if (source is null)
            throw Failed(AdminLogsErrorCodes.FileUnavailable, "The requested log file is unavailable.", "SourceNotConfigured", 404, auditContext);

        var currentFingerprint = AdminLogAppService.CreateRootFingerprint(source);
        if (!FixedTimeEquals(claim!.RootFingerprint, currentFingerprint))
            throw Failed(AdminLogsErrorCodes.FileUnavailable, "The requested log file is unavailable.", "SourceChanged", 404, auditContext, source.Key, claim.FileName);

        if (!AdminLogFileIdProtector.IsSafeBasename(claim.FileName)
            || !_options.AllowedExtensions.Contains(Path.GetExtension(claim.FileName), StringComparer.OrdinalIgnoreCase))
        {
            throw Failed(AdminLogsErrorCodes.FileUnavailable, "The requested log file is unavailable.", "UnsafeFileClaim", 404, auditContext, source.Key);
        }

        OpenedFileHandle opened;
        try
        {
            opened = _opener.Open(source, claim, _options.MaximumDownloadBytes);
        }
        catch (AdminLogFileOpenException exception)
        {
            throw exception.Failure switch
            {
                AdminLogFileOpenFailure.FileChanged => Failed(AdminLogsErrorCodes.FileChanged, "The requested log file has changed.", "FileChanged", 409, auditContext, source.Key, claim.FileName),
                AdminLogFileOpenFailure.FileTooLarge => Failed(AdminLogsErrorCodes.FileTooLarge, "The requested log file exceeds the download limit.", "FileTooLarge", 413, auditContext, source.Key, claim.FileName),
                AdminLogFileOpenFailure.SourceUnavailable => Failed(AdminLogsErrorCodes.SourceUnavailable, "The requested log source is temporarily unavailable.", "SourceUnavailable", 503, auditContext, source.Key, claim.FileName),
                _ => Failed(AdminLogsErrorCodes.FileUnavailable, "The requested log file is unavailable.", "FileUnavailable", 404, auditContext, source.Key, claim.FileName),
            };
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            throw Failed(AdminLogsErrorCodes.SourceUnavailable, "The requested log source is temporarily unavailable.", "OpenFailure", 503, auditContext, source.Key, claim.FileName);
        }

        var result = new OpenedAdminLogFile(
            opened.Stream,
            claim.FileName,
            source.Key,
            claim.SizeBytes,
            opened.LastModifiedUtc,
            auditContext);
        return Task.FromResult(result);
    }

    private BusinessException Failed(
        string code,
        string message,
        string category,
        int status,
        AdminLogDownloadAuditContext context,
        string sourceKey = "unavailable",
        string safeFileName = "unavailable")
    {
        _audit.Write(new AdminLogDownloadAuditRecord(
            context,
            "Failed",
            sourceKey,
            safeFileName,
            0,
            0,
            _timeProvider.GetUtcNow(),
            category,
            status));
        return new BusinessException(code, message);
    }

    private AdminLogDownloadAuditContext CreateAuditContext(string fileId)
    {
        var httpContext = _httpContextAccessor.HttpContext;
        return new AdminLogDownloadAuditContext(
            httpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier),
            httpContext?.User.Identity?.Name ?? "unknown",
            httpContext?.TraceIdentifier ?? "unavailable",
            CreateFileReference(fileId));
    }

    private static string CreateFileReference(string? fileId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(fileId ?? string.Empty));
        return Convert.ToHexString(hash.AsSpan(0, 12));
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        var leftBytes = Encoding.UTF8.GetBytes(left);
        var rightBytes = Encoding.UTF8.GetBytes(right);
        return leftBytes.Length == rightBytes.Length
               && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
    }
}
