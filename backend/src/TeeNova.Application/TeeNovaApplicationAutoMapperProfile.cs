using AutoMapper;
using TeeNova.Catalog;
using TeeNova.Catalog.Dtos;
using TeeNova.Customization;
using TeeNova.Enquiries;
using TeeNova.Enquiries.Dtos;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;
using TeeNova.Payments;
using TeeNova.PrintConfig;
using TeeNova.PrintConfig.Dtos;

namespace TeeNova;

public class TeeNovaApplicationAutoMapperProfile : Profile
{
    public TeeNovaApplicationAutoMapperProfile()
    {
        // Catalog
        CreateMap<Product, ProductDto>()
            .ForMember(d => d.PrintPriceTiers, o => o.Ignore())          // group-scoped; populated in app service
            .ForMember(d => d.PrintConfigOptions, o => o.Ignore())       // populated in app service
            .ForMember(d => d.QuantityPriceTiers, o => o.Ignore())       // populated in app service (Jira 9503)
            .ForMember(d => d.FixedSizePriceOptions, o => o.Ignore());   // populated in app service (Jira 9516)
        CreateMap<Product, ProductListItemDto>()
            .ForMember(d => d.VariantCount, o => o.MapFrom(s => s.Variants.Count))
            .ForMember(d => d.ThumbnailUrl,
                o => o.MapFrom(s => s.Images
                    .OrderByDescending(i => i.IsPrimary)
                    .ThenBy(i => i.SortOrder)
                    .Select(i => i.Url)
                    .FirstOrDefault()))
            .ForMember(d => d.PrimaryImageUrl,
                o => o.MapFrom(s => s.Images
                    .OrderByDescending(i => i.IsPrimary)
                    .ThenBy(i => i.SortOrder)
                    .Select(i => i.Url)
                    .FirstOrDefault()));
        CreateMap<ProductVariant, ProductVariantDto>();
        CreateMap<ProductImage, ProductImageDto>();
        CreateMap<ProductPriceTier, ProductPriceTierDto>();
        CreateMap<ProductQuantityPriceTier, ProductQuantityPriceTierDto>();
        CreateMap<ProductFixedSizePriceOption, ProductFixedSizePriceOptionDto>();
        CreateMap<PrintPricingGroup, PrintPricingGroupDto>();
        CreateMap<ProductPrintPriceTier, ProductPrintPriceTierDto>();
        CreateMap<ProductPrintConfigOption, ProductPrintConfigOptionDto>();

        // PrintConfig
        CreateMap<PrintArea, PrintAreaDto>();
        CreateMap<PrintSize, PrintSizeDto>();
        CreateMap<PrintAreaSizeOption, PrintAreaSizeOptionDto>()
            .ForMember(d => d.PrintSize, o => o.Ignore()); // populated manually in app service

        // Orders
        CreateMap<Order, OrderDto>()
            .ForMember(d => d.Items, o => o.MapFrom(s => s.Items))
            .ForMember(d => d.DisplayStatus, o => o.Ignore())
            .ForMember(d => d.Timeline, o => o.Ignore())
            .ForMember(d => d.PaymentTransactions, o => o.Ignore())
            .ForMember(d => d.PriceAdjustments, o => o.Ignore())
            .ForMember(d => d.HasPriceAdjustment, o => o.Ignore())
            .ForMember(d => d.LastPriceAdjustedAt, o => o.Ignore())
            .ForMember(d => d.LastPriceAdjustmentReason, o => o.Ignore())
            .ForMember(d => d.LastPriceAdjustmentAmount, o => o.Ignore());
        CreateMap<OrderTimelineEntry, OrderTimelineEntryDto>();
        CreateMap<PaymentTransaction, PaymentTransactionDto>();
        CreateMap<OrderPriceAdjustment, OrderPriceAdjustmentDto>();
        CreateMap<OrderItem, OrderItemDto>()
            .ForMember(d => d.Prints, o => o.MapFrom(s => s.Prints))
            .ForMember(d => d.BannerDetail, o => o.MapFrom(s => s.BannerDetail));
        CreateMap<OrderItemBannerDetail, BannerDetailDto>();
        CreateMap<OrderItemPrint, OrderItemPrintDto>()
            .ForMember(d => d.UploadedAssetId, o => o.MapFrom(s => s.UploadedAssetId))
            .ForMember(d => d.UploadedAssetUrl, o => o.MapFrom(s => s.UploadedAssetUrl))
            .ForMember(d => d.DesignNote, o => o.MapFrom(s => s.DesignNote));
        CreateMap<ShippingAddress, ShippingAddressDto>();
        CreateMap<OnlinePaymentSession, OnlinePaymentSessionDto>();

        // Enquiries (Jira 9512)
        CreateMap<BannerQuoteRequest, BannerQuoteRequestDto>();

        // UploadedAsset
        CreateMap<UploadedAsset, Files.Dtos.UploadFileOutput>()
            .ForMember(d => d.AssetId, o => o.MapFrom(s => s.Id))
            .ForMember(d => d.FileUrl, o => o.MapFrom(s => s.StoredFileUrl));
    }
}
