using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using TeeNova.Orders.Dtos;

namespace TeeNova.Pricing.Dtos;

public class PriceCalculationRequestDto
{
    [Required]
    public Guid ProductId { get; set; }

    /// <summary>
    /// Garment variant. Optional (Jira 9503): required for garment quotes (enforced server-side),
    /// omitted for non-garment quotes such as Badge (price depends only on quantity, not variant).
    /// </summary>
    public Guid? VariantId { get; set; }

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    /// <summary>
    /// Optional (Jira 9102): the total quantity of this product across all variant lines in the
    /// order, used for quantity-break tier resolution (tier scope is per-product, not per-line).
    /// When null, falls back to <see cref="Quantity"/>. LineTotal always uses <see cref="Quantity"/>.
    /// </summary>
    [Range(1, 100000)]
    public int? TierQuantity { get; set; }

    public List<PrintCalculationItemDto> Prints { get; set; } = new();

    /// <summary>
    /// Banner configuration (Jira 9516). Required for a FixedSize Banner live quote — the server reads
    /// only <c>SizePresetId</c> (the selected fixed-size option) for pricing; all other size fields are
    /// ignored. Null for Garment/Badge quotes. Carries no price fields (backend is authoritative).
    /// </summary>
    public BannerDetailInputDto? BannerDetail { get; set; }
}
