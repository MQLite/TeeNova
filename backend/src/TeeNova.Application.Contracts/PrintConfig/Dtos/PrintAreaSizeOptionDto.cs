using System;

namespace TeeNova.PrintConfig.Dtos;

public class PrintAreaSizeOptionDto
{
    public Guid Id { get; set; }
    public Guid PrintAreaId { get; set; }
    public Guid PrintSizeId { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public PrintSizeDto PrintSize { get; set; } = default!;
}
