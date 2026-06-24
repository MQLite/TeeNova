using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// A print-pricing aggregation scope (Jira 9203). Products assigned to the same
/// <see cref="PrintPricingGroup"/> combine their order/garment quantities when resolving
/// quantity-break <b>print</b> tiers (<see cref="ProductPrintPriceTier"/>): different products and
/// different PrintSize values in the same group all contribute to one group quantity used to pick
/// the tier break. Different groups never combine, and products with no group stay isolated.
///
/// The group only governs the tier <i>threshold</i>; the selected PrintSize still selects which
/// price ladder (UnitPrintPrice) is used. The garment/base price is unaffected by groups.
/// </summary>
public class PrintPricingGroup : Entity<Guid>
{
    public string Name { get; set; } = default!;

    /// <summary>Short stable code (e.g. "TSHIRT_PRINT"). Unique across groups.</summary>
    public string Code { get; set; } = default!;

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected PrintPricingGroup() { }

    public PrintPricingGroup(Guid id, string name, string code) : base(id)
    {
        Name = name;
        Code = code;
    }
}
