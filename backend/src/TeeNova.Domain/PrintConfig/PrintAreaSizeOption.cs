using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.PrintConfig;

public class PrintAreaSizeOption : Entity<Guid>
{
    public Guid PrintAreaId { get; set; }
    public Guid PrintSizeId { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected PrintAreaSizeOption() { }

    public PrintAreaSizeOption(Guid id, Guid printAreaId, Guid printSizeId) : base(id)
    {
        PrintAreaId = printAreaId;
        PrintSizeId = printSizeId;
    }
}
