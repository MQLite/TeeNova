using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Catalog;

namespace TeeNova.EntityFrameworkCore.Catalog;

public class ProductEntityTypeConfiguration :
    IEntityTypeConfiguration<Product>,
    IEntityTypeConfiguration<ProductVariant>,
    IEntityTypeConfiguration<ProductImage>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("Products");

        builder.Property(p => p.Name)
            .IsRequired()
            .HasMaxLength(CatalogConsts.MaxProductNameLength);

        builder.Property(p => p.Description)
            .HasMaxLength(CatalogConsts.MaxProductDescriptionLength);

        builder.Property(p => p.ProductType)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(p => p.BasePrice)
            .HasColumnType("decimal(18,4)");

        builder.HasMany(p => p.Variants)
            .WithOne()
            .HasForeignKey(v => v.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(p => p.Images)
            .WithOne()
            .HasForeignKey(i => i.ProductId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    public void Configure(EntityTypeBuilder<ProductVariant> builder)
    {
        builder.ToTable("ProductVariants");

        builder.Property(v => v.Sku)
            .IsRequired()
            .HasMaxLength(CatalogConsts.MaxSkuLength);

        builder.HasIndex(v => v.Sku).IsUnique();

        builder.Property(v => v.Color).IsRequired().HasMaxLength(CatalogConsts.MaxColorLength);
        builder.Property(v => v.Size).IsRequired().HasMaxLength(CatalogConsts.MaxSizeLength);
        builder.Property(v => v.PriceAdjustment).HasColumnType("decimal(18,4)");
    }

    public void Configure(EntityTypeBuilder<ProductImage> builder)
    {
        builder.ToTable("ProductImages");

        builder.Property(i => i.Url)
            .IsRequired()
            .HasMaxLength(CatalogConsts.MaxImageUrlLength);

        builder.Property(i => i.Color)
            .HasMaxLength(CatalogConsts.MaxColorLength);
    }
}
