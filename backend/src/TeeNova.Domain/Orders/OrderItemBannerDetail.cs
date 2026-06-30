using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Orders;

/// <summary>
/// Banner configuration snapshot for a single <see cref="OrderItem"/> (Jira 9511). One OrderItem has
/// zero or one of these; only <c>ProductKind.Banner</c> items carry it (Garment and Badge never do).
///
/// This is an <b>order snapshot</b>, not live product config — the captured dimensions/material/finishing
/// reflect what the customer requested at order/enquiry time and must not change if the product later
/// changes. It deliberately stores structured DB columns rather than JSON (replacing the reserved
/// <c>OrderItem.ConfigurationJson</c> approach), and carries <b>no price fields</b>: Banner is
/// <c>PricingModel.CustomQuoteOnly</c> (enquiry-first); the admin sets the chargeable total separately.
///
/// It has no link to <c>ProductVariant</c> and no link to <c>PrintArea</c>/<c>PrintSize</c> — Banner
/// neither uses variants nor creates <c>OrderItemPrint</c> rows.
/// </summary>
public class OrderItemBannerDetail : Entity<Guid>
{
    /// <summary>FK to the owning <see cref="OrderItem"/> (one-to-one; cascade-deleted with the item).</summary>
    public Guid OrderItemId { get; set; }

    /// <summary>Whether the size is a catalogued preset or customer-entered custom dimensions.</summary>
    public BannerSizeMode SizeMode { get; set; }

    /// <summary>Optional reference to a future fixed-size price option. Nullable placeholder (no FK yet).</summary>
    public Guid? SizePresetId { get; set; }

    /// <summary>Human-readable size label snapshot, e.g. "Pull-up 850×2000".</summary>
    public string? SizeLabel { get; set; }

    /// <summary>Width in <see cref="Unit"/>; required for <see cref="BannerSizeMode.Custom"/>.</summary>
    public decimal? Width { get; set; }

    /// <summary>Height in <see cref="Unit"/>; required for <see cref="BannerSizeMode.Custom"/>.</summary>
    public decimal? Height { get; set; }

    /// <summary>Unit of <see cref="Width"/>/<see cref="Height"/>; required whenever dimensions are present.</summary>
    public BannerDimensionUnit? Unit { get; set; }

    /// <summary>Server-computed area (m²) from width/height/unit. Never trusted from the client.</summary>
    public decimal? AreaSquareMetres { get; set; }

    /// <summary>Banner substrate/material.</summary>
    public BannerMaterial Material { get; set; }

    /// <summary>Free-text material name when <see cref="Material"/> is <see cref="BannerMaterial.Other"/>.</summary>
    public string? MaterialDisplayName { get; set; }

    // ── Finishing options (booleans — always safe) ───────────────────────────────
    public bool FinishingEyelets { get; set; }
    public bool FinishingHemming { get; set; }
    public bool FinishingPolePocket { get; set; }

    /// <summary>Free-text finishing requirement beyond the standard flags.</summary>
    public string? FinishingOther { get; set; }

    public bool StandIncluded { get; set; }
    public bool StandReplacementOnly { get; set; }

    public string? Notes { get; set; }

    protected OrderItemBannerDetail() { }

    public OrderItemBannerDetail(Guid id, Guid orderItemId)
        : base(id)
    {
        OrderItemId = orderItemId;
    }
}
