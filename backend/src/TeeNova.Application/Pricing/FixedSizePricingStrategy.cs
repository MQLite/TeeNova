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
/// Banner fixed-size pricing (Jira 9516): <see cref="PricingModel.FixedSize"/>. The customer selects one
/// active <see cref="ProductFixedSizePriceOption"/> (a catalogued standard size with a known unit price);
/// the line is priced authoritatively as <c>option.UnitPrice × quantity</c>. Unlike CustomQuoteOnly this
/// IS auto-priced, so a FixedSize Banner can flow through normal paid checkout.
///
/// The client never supplies price or dimensions for pricing: the selected option id
/// (<c>BannerDetail.SizePresetId</c>) is the only trusted size input — the server resolves the option and
/// snapshots its Label/Width/Height/Unit + server-computed area into the order's Banner detail. The
/// customer's non-priced Banner fields (material, finishing, stand, notes) are preserved and validated.
///
/// Enforced authoritatively: no prints, no variant, quantity ≥ <c>Product.MinimumQuantity</c>, a design
/// asset when <c>Product.DesignUploadRequired</c>, a supplied BannerDetail, a selected size option, and
/// that the option is active and belongs to the product.
/// </summary>
[ExposeServices(typeof(IItemPricingStrategy))]
public class FixedSizePricingStrategy : IItemPricingStrategy, ITransientDependency
{
    private readonly IRepository<ProductFixedSizePriceOption, Guid> _fixedSizeOptionRepository;
    private readonly BannerDetailValidator                         _bannerDetailValidator;

    public FixedSizePricingStrategy(
        IRepository<ProductFixedSizePriceOption, Guid> fixedSizeOptionRepository,
        BannerDetailValidator                         bannerDetailValidator)
    {
        _fixedSizeOptionRepository = fixedSizeOptionRepository;
        _bannerDetailValidator     = bannerDetailValidator;
    }

    public PricingModel Model => PricingModel.FixedSize;

    public async Task<PricedOrderItem> PriceItemAsync(ItemPricingContext context)
    {
        var product = context.Product;
        var item    = context.Item;

        // FixedSize has no prints — reject rather than silently ignore so order data stays unambiguous.
        if (item.Prints is { Count: > 0 })
            throw new BusinessException("TeeNova:Pricing:FixedSizeDoesNotSupportPrints")
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

        // Banner detail is required, and must carry the selected fixed-size option id.
        if (item.BannerDetail == null)
            throw new BusinessException("TeeNova:Banner:BannerDetailRequired")
                .WithData("ProductId", product.Id);

        var presetId = item.BannerDetail.SizePresetId
            ?? throw new BusinessException("TeeNova:Pricing:FixedSizeOptionRequired")
                .WithData("ProductId", product.Id);

        // Resolve the selected option and authorize it: exists, belongs to this product, and is active.
        var option = await _fixedSizeOptionRepository.FindAsync(presetId)
            ?? throw new BusinessException("TeeNova:Pricing:FixedSizeOptionNotFound")
                .WithData("ProductId", product.Id)
                .WithData("SizePresetId", presetId);

        if (option.ProductId != product.Id)
            throw new BusinessException("TeeNova:Pricing:FixedSizeOptionProductMismatch")
                .WithData("ProductId", product.Id)
                .WithData("SizePresetId", presetId)
                .WithData("OptionProductId", option.ProductId);

        if (!option.IsActive)
            throw new BusinessException("TeeNova:Pricing:FixedSizeOptionInactive")
                .WithData("ProductId", product.Id)
                .WithData("SizePresetId", presetId);

        // Snapshot trusted server option values (size) + validated non-priced client fields (material/etc).
        var bannerDetail = _bannerDetailValidator.NormalizeForFixedSizePreset(
            item.BannerDetail,
            option.Id,
            option.Label,
            option.Width,
            option.Height,
            option.Unit);

        return new PricedOrderItem(
            item.Id,
            product.Id, product.Name,
            ProductVariantId: null,     // FixedSize Banner never uses a variant
            VariantLabel: null,
            item.Quantity,
            UnitPrice: option.UnitPrice, // authoritative: selected option's unit price
            Prints: new List<PricedOrderPrint>(),
            PricingModel.FixedSize,
            product.Kind,
            UploadedAssetId: item.UploadedAssetId,
            UploadedAssetUrl: item.UploadedAssetUrl,
            DesignNote: item.DesignNote,
            AppliedQuantityTierMinQuantity: null,
            ConfigurationJson: null,    // Banner config lives in the structured BannerDetail snapshot
            BannerDetail: bannerDetail);
    }
}
