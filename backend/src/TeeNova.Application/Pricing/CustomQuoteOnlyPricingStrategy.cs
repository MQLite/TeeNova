using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Catalog;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Pricing;

/// <summary>
/// Custom-quote pricing (Jira 9511): <see cref="PricingModel.CustomQuoteOnly"/>, used by Banner
/// (<see cref="ProductKind.Banner"/>) and any other manual-quote product. There is NO automated price —
/// the resolved <c>UnitPrice</c> is a non-chargeable <b>placeholder (0)</b>. Banner is enquiry-first:
/// this strategy alone must never make a paid checkout possible; the customer order-creation path guards
/// against CustomQuoteOnly items entering normal paid checkout (see <c>OrderAppService.CreateAsync</c>),
/// and the admin sets the real total later via the existing price-adjust flow.
///
/// The strategy still validates the item authoritatively: no prints, no variant, minimum quantity,
/// design-required, and — for Banner — a valid normalized <c>BannerDetail</c> snapshot.
/// </summary>
[ExposeServices(typeof(IItemPricingStrategy))]
public class CustomQuoteOnlyPricingStrategy : IItemPricingStrategy, ITransientDependency
{
    private readonly BannerDetailValidator _bannerDetailValidator;

    public CustomQuoteOnlyPricingStrategy(BannerDetailValidator bannerDetailValidator)
    {
        _bannerDetailValidator = bannerDetailValidator;
    }

    public PricingModel Model => PricingModel.CustomQuoteOnly;

    public Task<PricedOrderItem> PriceItemAsync(ItemPricingContext context)
    {
        var product = context.Product;
        var item    = context.Item;

        // No prints — reject rather than silently ignore so order data stays unambiguous.
        if (item.Prints is { Count: > 0 })
            throw new BusinessException("TeeNova:Pricing:CustomQuoteOnlyDoesNotSupportPrints")
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

        // Banner requires a configuration snapshot; other CustomQuoteOnly kinds validate only if supplied.
        BannerDetailSnapshot? bannerDetail = null;
        if (product.Kind == ProductKind.Banner)
            bannerDetail = _bannerDetailValidator.ValidateAndNormalize(item.BannerDetail);
        else if (item.BannerDetail != null)
            bannerDetail = _bannerDetailValidator.ValidateAndNormalize(item.BannerDetail);

        var priced = new PricedOrderItem(
            item.Id,
            product.Id, product.Name,
            ProductVariantId: null,   // CustomQuoteOnly never uses a variant
            VariantLabel: null,
            item.Quantity,
            UnitPrice: 0m,            // non-chargeable placeholder — admin sets the real total later
            Prints: new List<PricedOrderPrint>(),
            PricingModel.CustomQuoteOnly,
            product.Kind,
            UploadedAssetId: item.UploadedAssetId,
            UploadedAssetUrl: item.UploadedAssetUrl,
            DesignNote: item.DesignNote,
            AppliedQuantityTierMinQuantity: null,
            ConfigurationJson: null,  // Banner config lives in the structured BannerDetail snapshot
            BannerDetail: bannerDetail);

        return Task.FromResult(priced);
    }
}
