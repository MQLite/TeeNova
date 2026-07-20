using System.ComponentModel.DataAnnotations;

namespace TeeNova.AdminLogs.Dtos;

public sealed class GetAdminLogsInput
{
    [StringLength(64)]
    public string? Source { get; set; }

    [StringLength(200)]
    public string? Search { get; set; }

    [StringLength(32)]
    public string? SortBy { get; set; }

    [StringLength(4)]
    public string? SortDirection { get; set; }

    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, int.MaxValue)]
    public int? PageSize { get; set; }
}
