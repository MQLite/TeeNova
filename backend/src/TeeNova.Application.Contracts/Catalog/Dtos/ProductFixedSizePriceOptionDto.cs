using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using TeeNova.Orders;

namespace TeeNova.Catalog.Dtos;

/// <summary>Read model for a Banner fixed-size price option (Jira 9516).</summary>
public class ProductFixedSizePriceOptionDto
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string Label { get; set; } = default!;
    public decimal Width { get; set; }
    public decimal Height { get; set; }
    public BannerDimensionUnit Unit { get; set; }
    public decimal UnitPrice { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>One option row in a <see cref="SetProductFixedSizePriceOptionsDto"/> replace payload.</summary>
public class SetProductFixedSizePriceOptionItemDto
{
    /// <summary>Existing option id (ignored — the set endpoint replaces the whole set). Optional.</summary>
    public Guid? Id { get; set; }

    [Required]
    [MaxLength(256)]
    public string Label { get; set; } = default!;

    [Range(0.0001, 1000000)]
    public decimal Width { get; set; }

    [Range(0.0001, 1000000)]
    public decimal Height { get; set; }

    public BannerDimensionUnit Unit { get; set; }

    [Range(0.01, 999999)]
    public decimal UnitPrice { get; set; }

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

/// <summary>
/// Replace-the-whole-set payload for a product's Banner fixed-size price options (dedicated
/// single-writer endpoint, Jira 9516). Sending an empty list clears the product's options (the product
/// then has no selectable fixed-size price until options are configured again). The client never sends
/// any resolved price beyond the per-option unit price the admin sets here.
/// </summary>
public class SetProductFixedSizePriceOptionsDto
{
    [Required]
    public List<SetProductFixedSizePriceOptionItemDto> Options { get; set; } = new();
}
