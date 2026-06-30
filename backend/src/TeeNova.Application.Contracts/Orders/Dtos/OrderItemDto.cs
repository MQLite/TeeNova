using System;
using System.Collections.Generic;
using TeeNova.Catalog;

namespace TeeNova.Orders.Dtos;

public class OrderItemDto
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }

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

    /// <summary>Reserved non-garment configuration snapshot (Banner); null for now.</summary>
    public string? ConfigurationJson { get; set; }

    public List<OrderItemPrintDto> Prints { get; set; } = new();
}
