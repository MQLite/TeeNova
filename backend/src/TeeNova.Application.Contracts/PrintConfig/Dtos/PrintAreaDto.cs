using System;

namespace TeeNova.PrintConfig.Dtos;

public class PrintAreaDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public string Code { get; set; } = default!;
    public decimal BasePrice { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public int? LegacyPositionValue { get; set; }
}
