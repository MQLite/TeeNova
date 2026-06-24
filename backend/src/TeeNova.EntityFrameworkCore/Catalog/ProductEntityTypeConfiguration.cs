using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Catalog;

namespace TeeNova.EntityFrameworkCore.Catalog;

public class ProductEntityTypeConfiguration :
    IEntityTypeConfiguration<Product>,
    IEntityTypeConfiguration<ProductVariant>,
    IEntityTypeConfiguration<ProductImage>,
    IEntityTypeConfiguration<ProductPriceTier>
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

        // Price tiers cascade with the product. The variant-override scope is a plain
        // nullable column (no FK) on purpose — this keeps variant deletion safe (nothing to
        // violate) and avoids SQL Server multiple-cascade-path errors. Orphaned override rows
        // (variant later deleted) are harmless: they never match a live variant during resolution.
        builder.HasMany(p => p.PriceTiers)
            .WithOne()
            .HasForeignKey(t => t.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        // Print-pricing group (Jira 9203). Plain nullable column with an index, no FK navigation —
        // the pricing resolver validates the group/tiers at runtime, and avoiding the FK keeps
        // product/group deletion free of cascade-path concerns (same discipline as the price-tier
        // variant-override scope above).
        builder.HasIndex(p => p.PrintPricingGroupId);
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

        // Inventory (Jira 9002) — informational only.
        // Stored as int (default 0 = NotRecorded) so existing rows backfill cleanly.
        builder.Property(v => v.InventoryStatus)
            .HasConversion<int>()
            .IsRequired()
            .HasDefaultValue(VariantInventoryStatus.NotRecorded);

        // StockQuantity is nullable (int?) — null means "not tracked".
        builder.Property(v => v.InventoryNote)
            .HasMaxLength(CatalogConsts.MaxInventoryNoteLength);

        builder.Property(v => v.InventoryUpdatedBy)
            .HasMaxLength(CatalogConsts.MaxInventoryUpdatedByLength);
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

    public void Configure(EntityTypeBuilder<ProductPriceTier> builder)
    {
        builder.ToTable("ProductPriceTiers");

        // Tier prices are validated to 2 decimals (the storefront money precision), so the
        // column is decimal(18,2). Values flow losslessly into the decimal(18,4) order snapshot.
        builder.Property(t => t.UnitPrice)
            .HasColumnType("decimal(18,2)");

        builder.HasIndex(t => t.ProductId);

        // Enforces "no duplicate MinQuantity within the same scope" at the DB level for every
        // scope — including product-level (ProductVariantId null). HasFilter(null) overrides EF's
        // default "IS NOT NULL" filter so null-variant rows are covered too; differing MinQuantity
        // keeps distinct breaks valid, while identical (ProductId, scope, MinQuantity) is rejected.
        builder.HasIndex(t => new { t.ProductId, t.ProductVariantId, t.MinQuantity })
            .IsUnique()
            .HasFilter(null);
    }
}
