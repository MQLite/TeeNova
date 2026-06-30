using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Catalog.Dtos;

/// <summary>Read model for a Badge quantity-break unit price rule (Jira 9503).</summary>
public class ProductQuantityPriceTierDto
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public int MinQuantity { get; set; }
    public decimal UnitPrice { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>One tier row in a <see cref="SetProductQuantityPriceTiersDto"/> replace payload.</summary>
public class CreateUpdateProductQuantityPriceTierDto
{
    [Range(1, 1000000)]
    public int MinQuantity { get; set; }

    [Range(0.01, 999999)]
    public decimal UnitPrice { get; set; }

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

/// <summary>
/// Replace-the-whole-set payload for a product's Badge quantity-tier unit prices (dedicated
/// single-writer endpoint, Jira 9503). Sending an empty list clears the product's quantity tiers
/// (the product then has no resolvable Badge price until tiers are configured again).
/// </summary>
public class SetProductQuantityPriceTiersDto
{
    [Required]
    public List<CreateUpdateProductQuantityPriceTierDto> Tiers { get; set; } = new();
}
