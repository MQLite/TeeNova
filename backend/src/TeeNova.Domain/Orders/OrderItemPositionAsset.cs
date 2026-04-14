using System;
using TeeNova.Customization;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Orders;

/// <summary>
/// A per-position design assignment for an order item.
/// Keeps uploaded asset references queryable instead of burying them in JSON.
/// </summary>
public class OrderItemPositionAsset : Entity<Guid>
{
    public Guid OrderItemId { get; private set; }
    public PrintPosition Position { get; private set; }
    public Guid? UploadedAssetId { get; private set; }
    public string? UploadedAssetUrl { get; private set; }
    public string? DesignNote { get; private set; }

    protected OrderItemPositionAsset()
    {
    }

    public OrderItemPositionAsset(
        Guid id,
        Guid orderItemId,
        PrintPosition position,
        Guid? uploadedAssetId = null,
        string? uploadedAssetUrl = null,
        string? designNote = null)
        : base(id)
    {
        OrderItemId = orderItemId;
        Position = position;
        UploadedAssetId = uploadedAssetId;
        UploadedAssetUrl = uploadedAssetUrl;
        DesignNote = designNote;
    }

    public void Update(Guid? uploadedAssetId, string? uploadedAssetUrl, string? designNote)
    {
        UploadedAssetId = uploadedAssetId;
        UploadedAssetUrl = uploadedAssetUrl;
        DesignNote = designNote;
    }
}
