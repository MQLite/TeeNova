using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Catalog;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Pricing;

/// <summary>
/// Badge pricing (Jira 9503): <see cref="PricingModel.QuantityTierUnit"/>. The unit price is resolved by
/// quantity break from the product's <see cref="ProductQuantityPriceTier"/> set; total = unit × quantity.
///
/// No garment variant and no print placements are involved. Badge design lives at item level
/// (<c>UploadedAssetId</c>/<c>Url</c>/<c>DesignNote</c>). The strategy enforces, authoritatively:
///   • <c>quantity ≥ Product.MinimumQuantity</c>,
///   • a design asset when <c>Product.DesignUploadRequired</c>,
///   • that no print rows were submitted (rejected to avoid ambiguous data),
///   • that at least one active quantity tier exists.
/// </summary>
[ExposeServices(typeof(IItemPricingStrategy))]
public class QuantityTierUnitPricingStrategy : IItemPricingStrategy, ITransientDependency
{
    private readonly IRepository<ProductQuantityPriceTier, Guid> _quantityTierRepository;

    public QuantityTierUnitPricingStrategy(IRepository<ProductQuantityPriceTier, Guid> quantityTierRepository)
    {
        _quantityTierRepository = quantityTierRepository;
    }

    public PricingModel Model => PricingModel.QuantityTierUnit;

    public async Task<PricedOrderItem> PriceItemAsync(ItemPricingContext context)
    {
        var product = context.Product;
        var item    = context.Item;

        // Badge has no prints — reject rather than silently ignore so order data stays unambiguous.
        if (item.Prints is { Count: > 0 })
            throw new BusinessException("TeeNova:Pricing:QuantityTierUnitDoesNotSupportPrints")
                .WithData("ProductId", product.Id);

        // Minimum quantity (authoritative).
        if (item.Quantity < product.MinimumQuantity)
            throw new BusinessException("TeeNova:Pricing:BelowMinimumQuantity")
                .WithData("ProductId", product.Id)
                .WithData("MinimumQuantity", product.MinimumQuantity)
                .WithData("Quantity", item.Quantity);

        // Required design upload (authoritative).
        if (product.DesignUploadRequired
            && item.UploadedAssetId == null
            && string.IsNullOrWhiteSpace(item.UploadedAssetUrl))
            throw new BusinessException("TeeNova:Pricing:DesignRequired")
                .WithData("ProductId", product.Id);

        // Resolve the quantity-tier unit price.
        var tiers = await _quantityTierRepository.GetListAsync(t => t.ProductId == product.Id);
        var resolved = QuantityTierResolver.Resolve(tiers, item.Quantity)
            ?? throw new BusinessException("TeeNova:Pricing:NoQuantityTiers")
                .WithData("ProductId", product.Id);

        return new PricedOrderItem(
            item.Id,
            product.Id, product.Name,
            ProductVariantId: null,
            VariantLabel: null,
            item.Quantity,
            resolved.UnitPrice,
            Prints: new List<PricedOrderPrint>(),
            PricingModel.QuantityTierUnit,
            product.Kind,
            UploadedAssetId: item.UploadedAssetId,
            UploadedAssetUrl: item.UploadedAssetUrl,
            DesignNote: item.DesignNote,
            AppliedQuantityTierMinQuantity: resolved.AppliedMinQuantity,
            ConfigurationJson: item.ConfigurationJson);
    }
}
