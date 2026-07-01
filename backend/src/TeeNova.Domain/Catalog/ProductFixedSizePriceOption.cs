using System;
using TeeNova.Orders;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

/// <summary>
/// A product-scoped fixed-size price option (Jira 9516) used by the Banner
/// <see cref="PricingModel.FixedSize"/> model. Each option is one catalogued standard size (e.g.
/// "Pull-up 850×2000 mm") with a known <see cref="UnitPrice"/>; the customer picks one active option
/// and the backend prices the line as <c>UnitPrice × quantity</c>.
///
/// This is <b>live product pricing config</b>, not an order snapshot — the chosen values are copied
/// into the order's <c>OrderItemBannerDetail</c> at pricing time so later config edits never change
/// past orders. Deliberately product-scoped ONLY: it has no <c>ProductVariantId</c>, no
/// <c>PrintArea</c>/<c>PrintSize</c> link, and carries no material-rate or finishing-rate fields
/// (those are out of scope; AreaBased/Hybrid are separate models). Cascades with the product, mirroring
/// <see cref="ProductQuantityPriceTier"/>.
/// </summary>
public class ProductFixedSizePriceOption : Entity<Guid>
{
    public Guid ProductId { get; set; }

    /// <summary>Human-readable option label, e.g. "Pull-up 850×2000 mm". Required.</summary>
    public string Label { get; set; } = default!;

    /// <summary>Width in <see cref="Unit"/>. Always &gt; 0.</summary>
    public decimal Width { get; set; }

    /// <summary>Height in <see cref="Unit"/>. Always &gt; 0.</summary>
    public decimal Height { get; set; }

    /// <summary>Unit of <see cref="Width"/>/<see cref="Height"/> (Mm/Cm/M). Required.</summary>
    public BannerDimensionUnit Unit { get; set; }

    /// <summary>Final per-unit price (NZD) for this size. Always ≥ 0.01, max 2 decimals.</summary>
    public decimal UnitPrice { get; set; }

    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    protected ProductFixedSizePriceOption() { }

    public ProductFixedSizePriceOption(
        Guid id,
        Guid productId,
        string label,
        decimal width,
        decimal height,
        BannerDimensionUnit unit,
        decimal unitPrice,
        bool isActive = true,
        int sortOrder = 0)
        : base(id)
    {
        ProductId = productId;
        Label     = label;
        Width     = width;
        Height    = height;
        Unit      = unit;
        UnitPrice = unitPrice;
        IsActive  = isActive;
        SortOrder = sortOrder;
    }
}
