using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeeNova.AdminLogs.Dtos;
using Volo.Abp;
using Volo.Abp.Application.Services;

namespace TeeNova.AdminLogs;

public sealed class AdminLogAppService : ApplicationService, IAdminLogAppService
{
    private const int MaximumSearchLength = 200;
    private const string FileTooLargeReason = "FileTooLarge";
    private const string SourceUnavailableWarning = "TeeNova:AdminLogs:SourceUnavailable";

    private readonly AdminLogsOptions _options;
    private readonly IAdminLogDirectoryEnumerator _directoryEnumerator;
    private readonly IAdminLogFileMetadataReader _metadataReader;
    private readonly IAdminLogFileIdProtector _fileIdProtector;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AdminLogAppService> _logger;

    public AdminLogAppService(
        IOptions<AdminLogsOptions> options,
        IAdminLogDirectoryEnumerator directoryEnumerator,
        IAdminLogFileMetadataReader metadataReader,
        IAdminLogFileIdProtector fileIdProtector,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AdminLogAppService> logger)
    {
        _options = options.Value;
        _directoryEnumerator = directoryEnumerator;
        _metadataReader = metadataReader;
        _fileIdProtector = fileIdProtector;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    public Task<AdminLogListResultDto> GetListAsync(GetAdminLogsInput input)
    {
        if (!_options.Enabled)
            throw SafeException(AdminLogsErrorCodes.Disabled, "Log listing is disabled.");

        var query = NormalizeAndValidateQuery(input);
        var configuredSources = SelectSources(query.Source);
        var extensions = _options.AllowedExtensions.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidates = new List<ListedFile>(Math.Min(_options.MaximumListItems, 1024));
        var sourceDtos = new List<AdminLogSourceDto>(configuredSources.Count);
        var warnings = new List<AdminLogWarningDto>();
        var inspectedEntries = 0;
        var truncated = false;

        foreach (var source in configuredSources)
        {
            var sourceItems = new List<ListedFile>();
            if (!_directoryEnumerator.Exists(source.Directory))
            {
                HandleUnavailableSource(source, query.Source is not null, sourceDtos, warnings, "DirectoryUnavailable");
                continue;
            }

            try
            {
                foreach (var path in _directoryEnumerator.EnumerateImmediateEntries(source.Directory))
                {
                    inspectedEntries++;
                    if (inspectedEntries > _options.MaximumListItems)
                    {
                        truncated = true;
                        break;
                    }

                    var fileName = Path.GetFileName(path);
                    if (!AdminLogFileIdProtector.IsSafeBasename(fileName))
                        continue;
                    if (!extensions.Contains(Path.GetExtension(fileName)))
                        continue;
                    if (!_metadataReader.TryReadRegularFile(path, out var metadata))
                        continue;

                    sourceItems.Add(new ListedFile(source, fileName, metadata));
                }

                candidates.AddRange(sourceItems);
                sourceDtos.Add(ToSourceDto(source, available: true));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException)
            {
                HandleUnavailableSource(source, query.Source is not null, sourceDtos, warnings, ex.GetType().Name);
            }

            if (truncated)
                break;
        }

        if (truncated)
        {
            _logger.LogWarning(
                "Admin log listing reached the configured entry inspection limit {MaximumListItems}.",
                _options.MaximumListItems);
        }

        IEnumerable<ListedFile> filtered = candidates;
        if (query.Search is not null)
            filtered = filtered.Where(file => file.FileName.Contains(query.Search, StringComparison.OrdinalIgnoreCase));

        var ordered = ApplySorting(filtered, query.SortBy, query.Descending).ToList();
        var totalCount = ordered.Count;
        var skip = (long)(query.Page - 1) * query.PageSize;
        var pageItems = skip >= totalCount
            ? []
            : ordered.Skip((int)skip).Take(query.PageSize).Select(ToDto).ToList();

        var httpContext = _httpContextAccessor.HttpContext;
        _logger.LogInformation(
            "Admin log listing completed for admin {AdminUser}; source {SourceKey}; returned {ResultCount}; total {TotalCount}; truncated {Truncated}; correlation {CorrelationId}.",
            httpContext?.User.Identity?.Name ?? "unknown",
            query.Source ?? "all",
            pageItems.Count,
            totalCount,
            truncated,
            httpContext?.TraceIdentifier ?? "unavailable");

        return Task.FromResult(new AdminLogListResultDto
        {
            Items = pageItems,
            Sources = sourceDtos,
            Warnings = warnings,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalCount = totalCount,
            IsTruncated = truncated,
        });
    }

    private NormalizedQuery NormalizeAndValidateQuery(GetAdminLogsInput input)
    {
        var source = NullIfWhiteSpace(input.Source);
        var search = NullIfWhiteSpace(input.Search);
        var sortBy = NullIfWhiteSpace(input.SortBy)?.ToLowerInvariant() ?? "lastmodifiedutc";
        var sortDirection = NullIfWhiteSpace(input.SortDirection)?.ToLowerInvariant() ?? "desc";
        var pageSize = input.PageSize ?? _options.DefaultPageSize;

        if (input.Page <= 0 || pageSize <= 0 || pageSize > _options.MaximumPageSize)
            throw InvalidQuery("Page and page size are outside the allowed range.");
        if (search is { Length: > MaximumSearchLength } || search?.Any(char.IsControl) == true)
            throw InvalidQuery("Search contains an unsupported value.");
        if (source?.Any(char.IsControl) == true)
            throw InvalidQuery("Source contains an unsupported value.");
        if (sortBy is not ("filename" or "source" or "sizebytes" or "lastmodifiedutc"))
            throw InvalidQuery("Sort field is not supported.");
        if (sortDirection is not ("asc" or "desc"))
            throw InvalidQuery("Sort direction is not supported.");

        return new NormalizedQuery(source, search, sortBy, sortDirection == "desc", input.Page, pageSize);
    }

    private IReadOnlyList<AdminLogSourceOptions> SelectSources(string? sourceKey)
    {
        if (sourceKey is null)
            return _options.Sources;

        var source = _options.Sources.SingleOrDefault(item => string.Equals(item.Key, sourceKey, StringComparison.Ordinal));
        if (source is null)
            throw SafeException(AdminLogsErrorCodes.SourceNotFound, "The requested log source was not found.");

        return [source];
    }

    private void HandleUnavailableSource(
        AdminLogSourceOptions source,
        bool specificallyRequested,
        List<AdminLogSourceDto> sourceDtos,
        List<AdminLogWarningDto> warnings,
        string category)
    {
        _logger.LogWarning(
            "Admin log source {SourceKey} is unavailable; category {FailureCategory}.",
            source.Key,
            category);

        if (specificallyRequested)
            throw SafeException(AdminLogsErrorCodes.SourceUnavailable, "The requested log source is temporarily unavailable.");

        sourceDtos.Add(ToSourceDto(source, available: false));
        warnings.Add(new AdminLogWarningDto
        {
            SourceKey = source.Key,
            Code = SourceUnavailableWarning,
            Message = "This log source is temporarily unavailable.",
        });
    }

    private AdminLogFileDto ToDto(ListedFile file)
    {
        var rootFingerprint = CreateRootFingerprint(file.Source);
        var id = _fileIdProtector.Protect(
            new AdminLogFileIdPayload
            {
                SourceKey = file.Source.Key,
                FileName = file.FileName,
                RootFingerprint = rootFingerprint,
                SizeBytes = file.Metadata.SizeBytes,
                LastModifiedUtc = file.Metadata.LastModifiedUtc,
                DeviceId = file.Metadata.DeviceId,
                Inode = file.Metadata.Inode,
            },
            TimeSpan.FromMinutes(_options.FileIdLifetimeMinutes));

        var downloadable = file.Metadata.SizeBytes <= _options.MaximumDownloadBytes;
        return new AdminLogFileDto
        {
            Id = id,
            FileName = file.FileName,
            SourceKey = file.Source.Key,
            SourceName = file.Source.DisplayName,
            SizeBytes = file.Metadata.SizeBytes,
            LastModifiedUtc = DateTime.SpecifyKind(file.Metadata.LastModifiedUtc, DateTimeKind.Utc),
            Downloadable = downloadable,
            DownloadBlockReason = downloadable ? null : FileTooLargeReason,
        };
    }

    public static string CreateRootFingerprint(AdminLogSourceOptions source)
    {
        var normalized = AdminLogsOptionsValidator.NormalizeDirectory(source.Directory);
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"v1\n{source.Key}\n{normalized}"));
        return Convert.ToHexString(bytes);
    }

    private static IOrderedEnumerable<ListedFile> ApplySorting(
        IEnumerable<ListedFile> files,
        string sortBy,
        bool descending)
    {
        Func<ListedFile, object> keySelector = sortBy switch
        {
            "filename" => file => file.FileName,
            "source" => file => file.Source.Key,
            "sizebytes" => file => file.Metadata.SizeBytes,
            _ => file => file.Metadata.LastModifiedUtc,
        };

        var comparer = Comparer<object>.Create(CompareSortValues);
        var ordered = descending
            ? files.OrderByDescending(keySelector, comparer)
            : files.OrderBy(keySelector, comparer);

        return ordered
            .ThenBy(file => file.Source.Key, StringComparer.Ordinal)
            .ThenBy(file => file.FileName, StringComparer.Ordinal);
    }

    private static int CompareSortValues(object? left, object? right)
    {
        if (left is string leftString && right is string rightString)
            return StringComparer.OrdinalIgnoreCase.Compare(leftString, rightString);
        return Comparer<object>.Default.Compare(left, right);
    }

    private static AdminLogSourceDto ToSourceDto(AdminLogSourceOptions source, bool available)
        => new() { Key = source.Key, DisplayName = source.DisplayName, Available = available };

    private static string? NullIfWhiteSpace(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static BusinessException InvalidQuery(string message)
        => SafeException(AdminLogsErrorCodes.InvalidQuery, message);

    private static BusinessException SafeException(string code, string message)
        => new(code, message);

    private sealed record NormalizedQuery(
        string? Source,
        string? Search,
        string SortBy,
        bool Descending,
        int Page,
        int PageSize);

    private sealed record ListedFile(
        AdminLogSourceOptions Source,
        string FileName,
        AdminLogFileMetadata Metadata);
}
