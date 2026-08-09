using Microsoft.Extensions.DependencyInjection;
using TeeNova.Catalog;
using TeeNova.Catalog.Dtos;
using TeeNova.Customization;
using TeeNova.Files.Dtos;
using Volo.Abp;
using Volo.Abp.Mapperly;

namespace TeeNova.Application.Tests.Mapping;

public class TeeNovaApplicationMapperTests
{
    [Fact]
    public void Application_module_registers_generated_mappers_by_convention()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication<TeeNovaApplicationModule>();
        using var provider = services.BuildServiceProvider();

        var mapper = provider.GetRequiredService<IAbpMapperlyMapper<Product, ProductListItemDto>>();

        Assert.IsType<ProductToProductListItemDtoMapper>(mapper);
    }

    [Fact]
    public void Product_list_mapper_preserves_custom_card_fields()
    {
        var productId = Guid.NewGuid();
        var product = new Product(productId, "Classic Tee", 24.95m)
        {
            Description = "Internal detail not present on the card DTO",
        };
        product.Variants.Add(new ProductVariant(Guid.NewGuid(), productId, "TEE-BLK-M", "Black", "M"));
        product.Images.Add(new ProductImage(Guid.NewGuid(), productId, "/secondary.jpg") { SortOrder = 0 });
        product.Images.Add(new ProductImage(Guid.NewGuid(), productId, "/primary.jpg", isPrimary: true) { SortOrder = 10 });

        var dto = Map<Product, ProductListItemDto>(new ProductToProductListItemDtoMapper(), product);

        Assert.Equal(productId, dto.Id);
        Assert.Equal("Classic Tee", dto.Name);
        Assert.Equal(1, dto.VariantCount);
        Assert.Equal("/primary.jpg", dto.ThumbnailUrl);
        Assert.Equal("/primary.jpg", dto.PrimaryImageUrl);
        Assert.Null(dto.FromPrice);
        Assert.False(dto.HasPriceTiers);
        Assert.Null(dto.Hero);
    }

    [Fact]
    public void Product_detail_mapper_maps_nested_catalog_rows()
    {
        var productId = Guid.NewGuid();
        var variantId = Guid.NewGuid();
        var imageId = Guid.NewGuid();
        var product = new Product(productId, "Hoodie", 54m, "hoodie");
        product.Variants.Add(new ProductVariant(variantId, productId, "HD-GRY-L", "Grey", "L"));
        product.Images.Add(new ProductImage(imageId, productId, "/hoodie.jpg", isPrimary: true));

        var dto = Map<Product, ProductDto>(new ProductToProductDtoMapper(), product);

        Assert.Equal(variantId, Assert.Single(dto.Variants).Id);
        Assert.Equal(imageId, Assert.Single(dto.Images).Id);
        Assert.Empty(dto.PrintPriceTiers);
        Assert.Empty(dto.PrintConfigOptions);
        Assert.Empty(dto.QuantityPriceTiers);
        Assert.Empty(dto.FixedSizePriceOptions);
    }

    [Fact]
    public void Uploaded_asset_mapper_preserves_renamed_fields()
    {
        var assetId = Guid.NewGuid();
        var asset = new UploadedAsset(
            assetId,
            "artwork.png",
            "/uploads/artwork.png",
            "image/png",
            1234);

        var dto = Map<UploadedAsset, UploadFileOutput>(new UploadedAssetToUploadFileOutputMapper(), asset);

        Assert.Equal(assetId, dto.AssetId);
        Assert.Equal("/uploads/artwork.png", dto.FileUrl);
        Assert.Equal("artwork.png", dto.OriginalFileName);
        Assert.Equal(1234, dto.FileSizeBytes);
    }

    private static TDestination Map<TSource, TDestination>(
        IAbpMapperlyMapper<TSource, TDestination> mapper,
        TSource source)
    {
        var services = new ServiceCollection();
        services.AddSingleton(mapper);
        using var provider = services.BuildServiceProvider();
        return new MapperlyAutoObjectMappingProvider(provider).Map<TSource, TDestination>(source!);
    }
}
