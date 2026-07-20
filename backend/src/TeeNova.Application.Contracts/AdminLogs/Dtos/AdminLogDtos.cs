using System;
using System.Collections.Generic;

namespace TeeNova.AdminLogs.Dtos;

public sealed class AdminLogFileDto
{
    public string Id { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string SourceKey { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime LastModifiedUtc { get; set; }
    public bool Downloadable { get; set; }
    public string? DownloadBlockReason { get; set; }
}

public sealed class AdminLogSourceDto
{
    public string Key { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool Available { get; set; }
}

public sealed class AdminLogWarningDto
{
    public string SourceKey { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public sealed class AdminLogListResultDto
{
    public List<AdminLogFileDto> Items { get; set; } = [];
    public List<AdminLogSourceDto> Sources { get; set; } = [];
    public List<AdminLogWarningDto> Warnings { get; set; } = [];
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public bool IsTruncated { get; set; }
}
