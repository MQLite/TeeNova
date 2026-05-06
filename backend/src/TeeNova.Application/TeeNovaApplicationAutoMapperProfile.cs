using AutoMapper;
using TeeNova.Catalog;
using TeeNova.Catalog.Dtos;
using TeeNova.Customization;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;
using TeeNova.PrintConfig;
using TeeNova.PrintConfig.Dtos;

namespace TeeNova;

public class TeeNovaApplicationAutoMapperProfile : Profile
{
    public TeeNovaApplicationAutoMapperProfile()
    {
        // Catalog
        CreateMap<Product, ProductDto>();
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

        // PrintConfig
        CreateMap<PrintArea, PrintAreaDto>();
        CreateMap<PrintSize, PrintSizeDto>();
        CreateMap<PrintAreaSizeOption, PrintAreaSizeOptionDto>()
            .ForMember(d => d.PrintSize, o => o.Ignore()); // populated manually in app service

        // Orders
        CreateMap<Order, OrderDto>()
            .ForMember(d => d.Items, o => o.MapFrom(s => s.Items))
            .ForMember(d => d.DisplayStatus, o => o.Ignore())
            .ForMember(d => d.Timeline, o => o.Ignore());
        CreateMap<OrderTimelineEntry, OrderTimelineEntryDto>();
        CreateMap<OrderItem, OrderItemDto>()
            .ForMember(d => d.Prints, o => o.MapFrom(s => s.Prints));
        CreateMap<OrderItemPrint, OrderItemPrintDto>()
            .ForMember(d => d.UploadedAssetId, o => o.MapFrom(s => s.UploadedAssetId))
            .ForMember(d => d.UploadedAssetUrl, o => o.MapFrom(s => s.UploadedAssetUrl))
            .ForMember(d => d.DesignNote, o => o.MapFrom(s => s.DesignNote));
        CreateMap<ShippingAddress, ShippingAddressDto>();

        // UploadedAsset
        CreateMap<UploadedAsset, Files.Dtos.UploadFileOutput>()
            .ForMember(d => d.AssetId, o => o.MapFrom(s => s.Id))
            .ForMember(d => d.FileUrl, o => o.MapFrom(s => s.StoredFileUrl));
    }
}
