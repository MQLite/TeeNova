using System;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

/// <summary>
/// Banner configuration snapshot returned on an order item (Jira 9511). Mirrors
/// <c>OrderItemBannerDetail</c>; carries no price fields. <see cref="AreaSquareMetres"/> is
/// server-computed and read-only.
/// </summary>
public class BannerDetailDto
{
    public Guid Id { get; set; }
    public BannerSizeMode SizeMode { get; set; }
    public Guid? SizePresetId { get; set; }
    public string? SizeLabel { get; set; }
    public decimal? Width { get; set; }
    public decimal? Height { get; set; }
    public BannerDimensionUnit? Unit { get; set; }
    public decimal? AreaSquareMetres { get; set; }
    public BannerMaterial Material { get; set; }
    public string? MaterialDisplayName { get; set; }
    public bool FinishingEyelets { get; set; }
    public bool FinishingHemming { get; set; }
    public bool FinishingPolePocket { get; set; }
    public string? FinishingOther { get; set; }
    public bool StandIncluded { get; set; }
    public bool StandReplacementOnly { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Banner configuration input on an order/enquiry item (Jira 9511). The server validates, normalizes,
/// and computes <c>AreaSquareMetres</c> — the client never supplies area or any price. Required for
/// <c>ProductKind.Banner</c> items (enforced server-side).
/// </summary>
public class BannerDetailInputDto
{
    public BannerSizeMode SizeMode { get; set; }
    public Guid? SizePresetId { get; set; }

    [MaxLength(256)]
    public string? SizeLabel { get; set; }

    public decimal? Width { get; set; }
    public decimal? Height { get; set; }
    public BannerDimensionUnit? Unit { get; set; }

    public BannerMaterial Material { get; set; }

    [MaxLength(128)]
    public string? MaterialDisplayName { get; set; }

    public bool FinishingEyelets { get; set; }
    public bool FinishingHemming { get; set; }
    public bool FinishingPolePocket { get; set; }

    [MaxLength(512)]
    public string? FinishingOther { get; set; }

    public bool StandIncluded { get; set; }
    public bool StandReplacementOnly { get; set; }

    [MaxLength(2000)]
    public string? Notes { get; set; }
}
