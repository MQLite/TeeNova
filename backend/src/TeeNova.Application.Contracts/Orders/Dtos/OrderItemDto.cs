using System;
using System.Collections.Generic;
using TeeNova.Catalog;

namespace TeeNova.Orders.Dtos;

public class OrderItemDto
{
    public Guid Id { get; set; }
    public Guid? ProductId { get; set; }
    public OrderItemProductSource ProductSource { get; set; }
    public Guid? OrderAdHocProductSnapshotId { get; set; }
    public string? ColourSnapshot { get; set; }
    public string? SizeSnapshot { get; set; }
    public bool IsAdHocProduct => ProductSource == OrderItemProductSource.AdHoc;
    public string InventoryBehavior =>
        IsAdHocProduct ? OrderAdHocInventoryBehavior.NotTracked.ToString() : "CataloguePolicy";

    /// <summary>Garment variant id; null for non-garment items (Badge) (Jira 9503).</summary>
    public Guid? ProductVariantId { get; set; }
    public string ProductName { get; set; } = default!;

    /// <summary>"Color / Size" snapshot for garments; null for non-garment items (Jira 9503).</summary>
    public string? VariantLabel { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal => UnitPrice * Quantity;

    // ── Model snapshot (Jira 9503) ───────────────────────────────────────────────
    public PricingModel PricingModel { get; set; }
    public ProductKind  ProductKind  { get; set; }

    // ── Item-level design (Jira 9503; used by Badge, null for garments) ───────────
    public Guid?   UploadedAssetId  { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote       { get; set; }

    /// <summary>Applied Badge quantity-tier MinQuantity snapshot (Jira 9503); null when not applicable.</summary>
    public int? AppliedQuantityTierMinQuantity { get; set; }

    /// <summary>Legacy reserved JSON config (superseded by <see cref="BannerDetail"/>); null for Banner MVP.</summary>
    public string? ConfigurationJson { get; set; }

    /// <summary>Banner configuration snapshot (Jira 9511). Non-null only for Banner items.</summary>
    public BannerDetailDto? BannerDetail { get; set; }

    public List<OrderItemPrintDto> Prints { get; set; } = new();
}
