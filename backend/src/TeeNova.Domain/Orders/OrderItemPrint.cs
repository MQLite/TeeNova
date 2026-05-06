using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Orders;

/// <summary>
/// Records a single print customization for an OrderItem:
/// WHERE (PrintArea) and HOW LARGE (PrintSize) the design is printed.
/// Snapshot fields preserve area/size data as it was at order placement.
/// </summary>
public class OrderItemPrint : Entity<Guid>
{
    public Guid OrderItemId { get; private set; }

    // ── Live references ───────────────────────────────────────────────────────
    public Guid PrintAreaId { get; private set; }
    public Guid PrintSizeId { get; private set; }

    // ── PrintArea snapshot ────────────────────────────────────────────────────
    public string PrintAreaName { get; private set; } = default!;
    public string PrintAreaCode { get; private set; } = default!;
    public decimal PrintAreaPrice { get; private set; }

    // ── PrintSize snapshot ────────────────────────────────────────────────────
    public string PrintSizeName { get; private set; } = default!;
    public string PrintSizeCode { get; private set; } = default!;
    public decimal PrintSizePrice { get; private set; }

    // ── Ordering / metadata ───────────────────────────────────────────────────
    public int SortOrder { get; private set; }
    public string? Notes { get; private set; }
    public Guid? UploadedAssetId { get; private set; }
    public string? UploadedAssetUrl { get; private set; }
    public string? DesignNote { get; private set; }

    protected OrderItemPrint() { }

    public OrderItemPrint(
        Guid id,
        Guid orderItemId,
        Guid printAreaId,
        string printAreaName,
        string printAreaCode,
        decimal printAreaPrice,
        Guid printSizeId,
        string printSizeName,
        string printSizeCode,
        decimal printSizePrice,
        int sortOrder = 0,
        string? notes = null,
        Guid? uploadedAssetId = null,
        string? uploadedAssetUrl = null,
        string? designNote = null)
        : base(id)
    {
        OrderItemId = orderItemId;
        PrintAreaId = printAreaId;
        PrintAreaName = printAreaName;
        PrintAreaCode = printAreaCode;
        PrintAreaPrice = printAreaPrice;
        PrintSizeId = printSizeId;
        PrintSizeName = printSizeName;
        PrintSizeCode = printSizeCode;
        PrintSizePrice = printSizePrice;
        SortOrder = sortOrder;
        Notes = notes;
        UploadedAssetId = uploadedAssetId;
        UploadedAssetUrl = uploadedAssetUrl;
        DesignNote = designNote;
    }

    public void UpdateDesign(
        Guid? uploadedAssetId,
        string? uploadedAssetUrl,
        string? designNote)
    {
        UploadedAssetId = uploadedAssetId;
        UploadedAssetUrl = uploadedAssetUrl;
        DesignNote = designNote;
    }
}
