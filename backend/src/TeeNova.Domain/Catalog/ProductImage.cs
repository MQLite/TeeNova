using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Catalog;

public class ProductImage : Entity<Guid>
{
    public Guid ProductId { get; set; }
    public string Url { get; set; } = default!;
    public bool IsPrimary { get; set; }
    public int SortOrder { get; set; }
    public string? Color { get; set; }

    protected ProductImage() { }

    public ProductImage(Guid id, Guid productId, string url, bool isPrimary = false)
        : base(id)
    {
        ProductId = productId;
        Url = url;
        IsPrimary = isPrimary;
    }
}
