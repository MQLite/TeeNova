using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.PrintConfig;

public class PrintArea : Entity<Guid>
{
    public string Name { get; set; } = default!;
    public string Code { get; set; } = default!;
    public decimal BasePrice { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected PrintArea() { }

    public PrintArea(Guid id, string name, string code) : base(id)
    {
        Name = name;
        Code = code;
    }
}
