using System.Linq;
using Riok.Mapperly.Abstractions;
using TeeNova.Catalog;
using TeeNova.Catalog.Dtos;
using TeeNova.Customization;
using TeeNova.Enquiries;
using TeeNova.Enquiries.Dtos;
using TeeNova.Files.Dtos;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;
using TeeNova.Payments;
using TeeNova.PrintConfig;
using TeeNova.PrintConfig.Dtos;
using Volo.Abp.Mapperly;

[assembly: MapperDefaults(RequiredMappingStrategy = RequiredMappingStrategy.Target)]

namespace TeeNova;

[Mapper]
public partial class ProductToProductDtoMapper : MapperBase<Product, ProductDto>
{
    [MapperIgnoreTarget(nameof(ProductDto.PrintPriceTiers))]
    [MapperIgnoreTarget(nameof(ProductDto.PrintConfigOptions))]
    [MapperIgnoreTarget(nameof(ProductDto.QuantityPriceTiers))]
    [MapperIgnoreTarget(nameof(ProductDto.FixedSizePriceOptions))]
    public override partial ProductDto Map(Product source);

    [MapperIgnoreTarget(nameof(ProductDto.PrintPriceTiers))]
    [MapperIgnoreTarget(nameof(ProductDto.PrintConfigOptions))]
    [MapperIgnoreTarget(nameof(ProductDto.QuantityPriceTiers))]
    [MapperIgnoreTarget(nameof(ProductDto.FixedSizePriceOptions))]
    public override partial void Map(Product source, ProductDto destination);
}

[Mapper]
public partial class ProductToProductListItemDtoMapper : MapperBase<Product, ProductListItemDto>
{
    [MapperIgnoreTarget(nameof(ProductListItemDto.VariantCount))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.ThumbnailUrl))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.PrimaryImageUrl))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.FromPrice))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.HasPriceTiers))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.Hero))]
    public override partial ProductListItemDto Map(Product source);

    [MapperIgnoreTarget(nameof(ProductListItemDto.VariantCount))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.ThumbnailUrl))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.PrimaryImageUrl))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.FromPrice))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.HasPriceTiers))]
    [MapperIgnoreTarget(nameof(ProductListItemDto.Hero))]
    public override partial void Map(Product source, ProductListItemDto destination);

    public override void AfterMap(Product source, ProductListItemDto destination)
    {
        destination.VariantCount = source.Variants.Count;
        var primaryImageUrl = source.Images
            .OrderByDescending(image => image.IsPrimary)
            .ThenBy(image => image.SortOrder)
            .Select(image => image.Url)
            .FirstOrDefault();
        destination.ThumbnailUrl = primaryImageUrl;
        destination.PrimaryImageUrl = primaryImageUrl;
    }
}

[Mapper]
public partial class ProductVariantToProductVariantDtoMapper : MapperBase<ProductVariant, ProductVariantDto>
{
    public override partial ProductVariantDto Map(ProductVariant source);
    public override partial void Map(ProductVariant source, ProductVariantDto destination);
}

[Mapper]
public partial class ProductImageToProductImageDtoMapper : MapperBase<ProductImage, ProductImageDto>
{
    public override partial ProductImageDto Map(ProductImage source);
    public override partial void Map(ProductImage source, ProductImageDto destination);
}

[Mapper]
public partial class ProductPriceTierToProductPriceTierDtoMapper : MapperBase<ProductPriceTier, ProductPriceTierDto>
{
    public override partial ProductPriceTierDto Map(ProductPriceTier source);
    public override partial void Map(ProductPriceTier source, ProductPriceTierDto destination);
}

[Mapper]
public partial class ProductQuantityPriceTierToProductQuantityPriceTierDtoMapper : MapperBase<ProductQuantityPriceTier, ProductQuantityPriceTierDto>
{
    public override partial ProductQuantityPriceTierDto Map(ProductQuantityPriceTier source);
    public override partial void Map(ProductQuantityPriceTier source, ProductQuantityPriceTierDto destination);
}

[Mapper]
public partial class ProductFixedSizePriceOptionToProductFixedSizePriceOptionDtoMapper : MapperBase<ProductFixedSizePriceOption, ProductFixedSizePriceOptionDto>
{
    public override partial ProductFixedSizePriceOptionDto Map(ProductFixedSizePriceOption source);
    public override partial void Map(ProductFixedSizePriceOption source, ProductFixedSizePriceOptionDto destination);
}

[Mapper]
public partial class PrintPricingGroupToPrintPricingGroupDtoMapper : MapperBase<PrintPricingGroup, PrintPricingGroupDto>
{
    public override partial PrintPricingGroupDto Map(PrintPricingGroup source);
    public override partial void Map(PrintPricingGroup source, PrintPricingGroupDto destination);
}

[Mapper]
public partial class ProductPrintPriceTierToProductPrintPriceTierDtoMapper : MapperBase<ProductPrintPriceTier, ProductPrintPriceTierDto>
{
    public override partial ProductPrintPriceTierDto Map(ProductPrintPriceTier source);
    public override partial void Map(ProductPrintPriceTier source, ProductPrintPriceTierDto destination);
}

[Mapper]
public partial class ProductPrintConfigOptionToProductPrintConfigOptionDtoMapper : MapperBase<ProductPrintConfigOption, ProductPrintConfigOptionDto>
{
    public override partial ProductPrintConfigOptionDto Map(ProductPrintConfigOption source);
    public override partial void Map(ProductPrintConfigOption source, ProductPrintConfigOptionDto destination);
}

[Mapper]
public partial class PrintAreaToPrintAreaDtoMapper : MapperBase<PrintArea, PrintAreaDto>
{
    public override partial PrintAreaDto Map(PrintArea source);
    public override partial void Map(PrintArea source, PrintAreaDto destination);
}

[Mapper]
public partial class PrintSizeToPrintSizeDtoMapper : MapperBase<PrintSize, PrintSizeDto>
{
    public override partial PrintSizeDto Map(PrintSize source);
    public override partial void Map(PrintSize source, PrintSizeDto destination);
}

[Mapper]
public partial class PrintAreaSizeOptionToPrintAreaSizeOptionDtoMapper : MapperBase<PrintAreaSizeOption, PrintAreaSizeOptionDto>
{
    [MapperIgnoreTarget(nameof(PrintAreaSizeOptionDto.PrintSize))]
    public override partial PrintAreaSizeOptionDto Map(PrintAreaSizeOption source);

    [MapperIgnoreTarget(nameof(PrintAreaSizeOptionDto.PrintSize))]
    public override partial void Map(PrintAreaSizeOption source, PrintAreaSizeOptionDto destination);
}

[Mapper]
public partial class OrderToOrderDtoMapper : MapperBase<Order, OrderDto>
{
    [MapperIgnoreTarget(nameof(OrderDto.DisplayStatus))]
    [MapperIgnoreTarget(nameof(OrderDto.Timeline))]
    [MapperIgnoreTarget(nameof(OrderDto.PaymentTransactions))]
    [MapperIgnoreTarget(nameof(OrderDto.PriceAdjustments))]
    [MapperIgnoreTarget(nameof(OrderDto.HasPriceAdjustment))]
    [MapperIgnoreTarget(nameof(OrderDto.LastPriceAdjustedAt))]
    [MapperIgnoreTarget(nameof(OrderDto.LastPriceAdjustmentReason))]
    [MapperIgnoreTarget(nameof(OrderDto.LastPriceAdjustmentAmount))]
    [MapperIgnoreTarget(nameof(OrderDto.PrintGroups))]
    public override partial OrderDto Map(Order source);

    [MapperIgnoreTarget(nameof(OrderDto.DisplayStatus))]
    [MapperIgnoreTarget(nameof(OrderDto.Timeline))]
    [MapperIgnoreTarget(nameof(OrderDto.PaymentTransactions))]
    [MapperIgnoreTarget(nameof(OrderDto.PriceAdjustments))]
    [MapperIgnoreTarget(nameof(OrderDto.HasPriceAdjustment))]
    [MapperIgnoreTarget(nameof(OrderDto.LastPriceAdjustedAt))]
    [MapperIgnoreTarget(nameof(OrderDto.LastPriceAdjustmentReason))]
    [MapperIgnoreTarget(nameof(OrderDto.LastPriceAdjustmentAmount))]
    [MapperIgnoreTarget(nameof(OrderDto.PrintGroups))]
    public override partial void Map(Order source, OrderDto destination);
}

[Mapper]
public partial class OrderTimelineEntryToOrderTimelineEntryDtoMapper : MapperBase<OrderTimelineEntry, OrderTimelineEntryDto>
{
    public override partial OrderTimelineEntryDto Map(OrderTimelineEntry source);
    public override partial void Map(OrderTimelineEntry source, OrderTimelineEntryDto destination);
}

[Mapper]
public partial class PaymentTransactionToPaymentTransactionDtoMapper : MapperBase<PaymentTransaction, PaymentTransactionDto>
{
    public override partial PaymentTransactionDto Map(PaymentTransaction source);
    public override partial void Map(PaymentTransaction source, PaymentTransactionDto destination);
}

[Mapper]
public partial class OrderPriceAdjustmentToOrderPriceAdjustmentDtoMapper : MapperBase<OrderPriceAdjustment, OrderPriceAdjustmentDto>
{
    public override partial OrderPriceAdjustmentDto Map(OrderPriceAdjustment source);
    public override partial void Map(OrderPriceAdjustment source, OrderPriceAdjustmentDto destination);
}

[Mapper]
public partial class OrderAdHocProductSnapshotToOrderAdHocProductSnapshotDtoMapper : MapperBase<OrderAdHocProductSnapshot, OrderAdHocProductSnapshotDto>
{
    public override partial OrderAdHocProductSnapshotDto Map(OrderAdHocProductSnapshot source);
    public override partial void Map(OrderAdHocProductSnapshot source, OrderAdHocProductSnapshotDto destination);
}

[Mapper]
public partial class OrderItemToOrderItemDtoMapper : MapperBase<OrderItem, OrderItemDto>
{
    public override partial OrderItemDto Map(OrderItem source);
    public override partial void Map(OrderItem source, OrderItemDto destination);
}

[Mapper]
public partial class OrderItemBannerDetailToBannerDetailDtoMapper : MapperBase<OrderItemBannerDetail, BannerDetailDto>
{
    public override partial BannerDetailDto Map(OrderItemBannerDetail source);
    public override partial void Map(OrderItemBannerDetail source, BannerDetailDto destination);
}

[Mapper]
public partial class OrderItemPrintToOrderItemPrintDtoMapper : MapperBase<OrderItemPrint, OrderItemPrintDto>
{
    public override partial OrderItemPrintDto Map(OrderItemPrint source);
    public override partial void Map(OrderItemPrint source, OrderItemPrintDto destination);
}

[Mapper]
public partial class ShippingAddressToShippingAddressDtoMapper : MapperBase<ShippingAddress, ShippingAddressDto>
{
    public override partial ShippingAddressDto Map(ShippingAddress source);
    public override partial void Map(ShippingAddress source, ShippingAddressDto destination);
}

[Mapper]
public partial class OnlinePaymentSessionToOnlinePaymentSessionDtoMapper : MapperBase<OnlinePaymentSession, OnlinePaymentSessionDto>
{
    public override partial OnlinePaymentSessionDto Map(OnlinePaymentSession source);
    public override partial void Map(OnlinePaymentSession source, OnlinePaymentSessionDto destination);
}

[Mapper]
public partial class BannerQuoteRequestToBannerQuoteRequestDtoMapper : MapperBase<BannerQuoteRequest, BannerQuoteRequestDto>
{
    public override partial BannerQuoteRequestDto Map(BannerQuoteRequest source);
    public override partial void Map(BannerQuoteRequest source, BannerQuoteRequestDto destination);
}

[Mapper]
public partial class UploadedAssetToUploadFileOutputMapper : MapperBase<UploadedAsset, UploadFileOutput>
{
    [MapperIgnoreTarget(nameof(UploadFileOutput.AssetId))]
    [MapperIgnoreTarget(nameof(UploadFileOutput.FileUrl))]
    public override partial UploadFileOutput Map(UploadedAsset source);

    [MapperIgnoreTarget(nameof(UploadFileOutput.AssetId))]
    [MapperIgnoreTarget(nameof(UploadFileOutput.FileUrl))]
    public override partial void Map(UploadedAsset source, UploadFileOutput destination);

    public override void AfterMap(UploadedAsset source, UploadFileOutput destination)
    {
        destination.AssetId = source.Id;
        destination.FileUrl = source.StoredFileUrl;
    }
}
