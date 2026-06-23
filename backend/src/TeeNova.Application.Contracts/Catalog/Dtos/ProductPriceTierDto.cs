using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Catalog.Dtos;

/// <summary>Read model for a quantity-break price rule (Jira 9102).</summary>
public class ProductPriceTierDto
{
    public Guid Id { get; set; }

    /// <summary>Null = product-level default tier. Non-null = variant-level override.</summary>
    public Guid? ProductVariantId { get; set; }

    public int MinQuantity { get; set; }

    public decimal UnitPrice { get; set; }
}

/// <summary>One tier row in a <see cref="SetProductPriceTiersDto"/> replace payload.</summary>
public class CreateUpdateProductPriceTierDto
{
    /// <summary>Null = product-level default tier. Non-null must reference a variant of this product.</summary>
    public Guid? ProductVariantId { get; set; }

    [Range(1, 100000)]
    public int MinQuantity { get; set; }

    [Range(0.01, 999999)]
    public decimal UnitPrice { get; set; }
}

/// <summary>
/// Replace-the-whole-set payload for the dedicated price-tiers endpoint. Sending an empty list
/// clears all tiers for the product (reverting it to the legacy additive formula).
/// </summary>
public class SetProductPriceTiersDto
{
    [Required]
    public List<CreateUpdateProductPriceTierDto> Tiers { get; set; } = new();
}
