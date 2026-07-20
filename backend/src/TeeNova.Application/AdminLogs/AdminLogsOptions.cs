using System.Collections.Generic;

namespace TeeNova.AdminLogs;

public sealed class AdminLogsOptions
{
    public const string SectionName = "AdminLogs";

    public bool Enabled { get; set; }

    public List<AdminLogSourceOptions> Sources { get; set; } = [];

    public List<string> AllowedExtensions { get; set; } = [".log", ".txt", ".json"];

    public long MaximumDownloadBytes { get; set; } = 100L * 1024L * 1024L;

    public int MaximumListItems { get; set; } = 500;

    public int DefaultPageSize { get; set; } = 50;

    public int MaximumPageSize { get; set; } = 100;

    public int FileIdLifetimeMinutes { get; set; } = 10;
}

public sealed class AdminLogSourceOptions
{
    public string Key { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string Directory { get; set; } = string.Empty;
}
