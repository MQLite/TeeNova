using System;
using TeeNova.Customization;
using Volo.Abp.Domain.Entities;

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

    // Customization snapshot
    public Guid? UploadedAssetId { get; set; }
    public string? UploadedAssetUrl { get; set; }   // denormalized URL for display
    public PrintPosition? PrintPosition { get; set; }

    // Future: DesignProjectId, TemplateId, CropFrameData (JSON)

    protected OrderItem() { }

    public OrderItem(
        Guid id, Guid orderId,
        Guid productId, Guid productVariantId,
        string productName, string variantLabel,
        int quantity, decimal unitPrice,
        Guid? uploadedAssetId = null, PrintPosition? printPosition = null,
        string? uploadedAssetUrl = null)
        : base(id)
    {
        OrderId = orderId;
        ProductId = productId;
        ProductVariantId = productVariantId;
        ProductName = productName;
        VariantLabel = variantLabel;
        Quantity = quantity;
        UnitPrice = unitPrice;
        UploadedAssetId = uploadedAssetId;
        UploadedAssetUrl = uploadedAssetUrl;
        PrintPosition = printPosition;
    }
}
