using System;
using TeeNova.Customization;
using Volo.Abp.Domain.Entities;
using System.Collections.Generic;
using System.Linq;

namespace TeeNova.Orders;

/// <summary>
/// Line item within an Order. Captures the product, variant, quantity,
/// and customization details (which design, where it prints).
/// </summary>
public class OrderItem : Entity<Guid>
{
    public Guid OrderId { get; set; }
    public Guid ProductId { get; set; }
    public Guid ProductVariantId { get; set; }
    public string ProductName { get; set; } = default!;
    public string VariantLabel { get; set; } = default!;   // e.g., "Red / XL"
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }

    public List<OrderItemPositionAsset> PositionAssets { get; private set; } = [];
    public List<OrderItemPrint> Prints { get; private set; } = [];

    // Future: DesignProjectId, TemplateId, CropFrameData (JSON)

    protected OrderItem() { }

    public OrderItem(
        Guid id, Guid orderId,
        Guid productId, Guid productVariantId,
        string productName, string variantLabel,
        int quantity, decimal unitPrice)
        : base(id)
    {
        OrderId = orderId;
        ProductId = productId;
        ProductVariantId = productVariantId;
        ProductName = productName;
        VariantLabel = variantLabel;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }

    public void AddPrint(
        Guid id,
        Guid printAreaId,
        string printAreaName,
        string printAreaCode,
        decimal printAreaPrice,
        Guid printSizeId,
        string printSizeName,
        string printSizeCode,
        decimal printSizePrice,
        int sortOrder = 0,
        string? notes = null)
    {
        Prints.Add(new OrderItemPrint(
            id, Id,
            printAreaId, printAreaName, printAreaCode, printAreaPrice,
            printSizeId, printSizeName, printSizeCode, printSizePrice,
            sortOrder, notes));
    }

    public void SetPositionAssets(IEnumerable<OrderItemPositionAsset> positionAssets)
    {
        PositionAssets.Clear();
        PositionAssets.AddRange(positionAssets);
    }

    public void UpsertPositionAsset(
        Guid id,
        PrintPosition position,
        Guid? uploadedAssetId = null,
        string? uploadedAssetUrl = null,
        string? designNote = null)
    {
        var existing = PositionAssets.FirstOrDefault(p => p.Position == position);
        if (existing == null)
        {
            PositionAssets.Add(new OrderItemPositionAsset(
                id,
                Id,
                position,
                uploadedAssetId,
                uploadedAssetUrl,
                designNote));
            return;
        }

        existing.Update(uploadedAssetId, uploadedAssetUrl, designNote);
    }
}
