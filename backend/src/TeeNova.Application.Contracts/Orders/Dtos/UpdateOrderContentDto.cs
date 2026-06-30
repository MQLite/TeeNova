using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

/// <summary>
/// Admin-only request to preview/save an order's editable content (Jira 9405). Carries the FULL desired
/// item set (replace semantics): items omitted here are removed, items with an existing <c>Id</c> are
/// updated/replaced, items with a null <c>Id</c> are added.
///
/// IMPORTANT: this DTO deliberately carries NO price fields. The backend is the sole pricing authority
/// (Epic 9200): it re-resolves the whole order (group-aware print-tier pricing) and computes every
/// UnitPrice / ResolvedUnitPrintPrice / TotalAmount. Any client-supplied price would be ignored.
/// </summary>
public class UpdateOrderContentDto
{
    [Required, MinLength(1)]
    public List<UpdateOrderItemContentDto> Items { get; set; } = new();
}

public class UpdateOrderItemContentDto
{
    /// <summary>Existing OrderItem id when editing/replacing; null when adding a new item.</summary>
    public Guid? Id { get; set; }

    [Required]
    public Guid ProductId { get; set; }

    /// <summary>
    /// Garment variant. Optional (Jira 9503): required for garment products (enforced server-side),
    /// omitted for non-garment products such as Badge.
    /// </summary>
    public Guid? ProductVariantId { get; set; }

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    // ── Item-level design (Jira 9503) — used by non-garment items (Badge). Garment design lives in Prints.
    public Guid?   UploadedAssetId  { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote       { get; set; }

    /// <summary>Legacy reserved JSON config (superseded by <see cref="BannerDetail"/>); ignored by Banner MVP.</summary>
    public string? ConfigurationJson { get; set; }

    /// <summary>Banner configuration (Jira 9511). Required for Banner products (enforced server-side); null otherwise.</summary>
    public BannerDetailInputDto? BannerDetail { get; set; }

    public List<UpdateOrderItemPrintContentDto> Prints { get; set; } = new();
}

public class UpdateOrderItemPrintContentDto
{
    /// <summary>Existing OrderItemPrint id when editing/replacing; null when adding a new print.</summary>
    public Guid? Id { get; set; }

    [Required]
    public Guid PrintAreaId { get; set; }

    [Required]
    public Guid PrintSizeId { get; set; }

    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote { get; set; }
    public string? PrintNotes { get; set; }
}
