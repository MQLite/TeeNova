using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Catalog;

namespace TeeNova.EntityFrameworkCore.Catalog;

public class ProductEntityTypeConfiguration :
    IEntityTypeConfiguration<Product>,
    IEntityTypeConfiguration<ProductVariant>,
    IEntityTypeConfiguration<ProductImage>,
    IEntityTypeConfiguration<ProductPriceTier>,
    IEntityTypeConfiguration<ProductQuantityPriceTier>,
    IEntityTypeConfiguration<ProductFixedSizePriceOption>
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

        // Behavioral discriminators (Jira 9503) — stored as strings (mirrors OrderStatus/PaymentStatus)
        // so the DB stays readable and resilient to enum reordering. Defaults backfill existing rows.
        builder.Property(p => p.Kind)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32)
            .HasDefaultValue(ProductKind.Garment);

        builder.Property(p => p.PricingModel)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32)
            .HasDefaultValue(PricingModel.GarmentPrint);

        builder.Property(p => p.MinimumQuantity)
            .IsRequired()
            .HasDefaultValue(1);

        builder.Property(p => p.DesignUploadRequired)
            .IsRequired()
            .HasDefaultValue(false);

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
        // nullable column (no FK) on purpose; this keeps variant deletion safe (nothing to
        // violate) and avoids SQL Server multiple-cascade-path errors. Orphaned override rows
        // (variant later deleted) are harmless: they never match a live variant during resolution.
        builder.HasMany(p => p.PriceTiers)
            .WithOne()
            .HasForeignKey(t => t.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        // Badge quantity-tier unit prices (Jira 9503). Product-owned; cascade with the product.
        builder.HasMany(p => p.QuantityPriceTiers)
            .WithOne()
            .HasForeignKey(t => t.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        // Banner fixed-size price options (Jira 9516). Product-owned; cascade with the product.
        builder.HasMany(p => p.FixedSizePriceOptions)
            .WithOne()
            .HasForeignKey(o => o.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        // Print-pricing group (Jira 9203). Plain nullable column with an index, no FK navigation;
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

        // Inventory (Jira 9002): informational only.
        // Stored as int (default 0 = NotRecorded) so existing rows backfill cleanly.
        builder.Property(v => v.InventoryStatus)
            .HasConversion<int>()
            .IsRequired()
            .HasDefaultValue(VariantInventoryStatus.NotRecorded);

        // StockQuantity is nullable (int?): null means "not tracked".
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
        // scope, including product-level (ProductVariantId null). HasFilter(null) overrides EF's
        // default "IS NOT NULL" filter so null-variant rows are covered too; differing MinQuantity
        // keeps distinct breaks valid, while identical (ProductId, scope, MinQuantity) is rejected.
        builder.HasIndex(t => new { t.ProductId, t.ProductVariantId, t.MinQuantity })
            .IsUnique()
            .HasFilter(null);
    }

    public void Configure(EntityTypeBuilder<ProductQuantityPriceTier> builder)
    {
        builder.ToTable("ProductQuantityPriceTiers");

        // Unit prices are validated to 2 decimals (storefront money precision); flows losslessly into
        // the decimal(18,4) OrderItem.UnitPrice snapshot.
        builder.Property(t => t.UnitPrice)
            .HasColumnType("decimal(18,2)");

        builder.HasIndex(t => t.ProductId);

        // Natural key: one unit price per (product, quantity break). No variant / print-size scope.
        builder.HasIndex(t => new { t.ProductId, t.MinQuantity })
            .IsUnique();
    }

    public void Configure(EntityTypeBuilder<ProductFixedSizePriceOption> builder)
    {
        builder.ToTable("ProductFixedSizePriceOptions");

        builder.Property(o => o.Label)
            .IsRequired()
            .HasMaxLength(256);

        // Dimensions match the OrderItemBannerDetail snapshot precision (decimal(18,4)) so option
        // values copy losslessly into the order snapshot.
        builder.Property(o => o.Width).HasColumnType("decimal(18,4)");
        builder.Property(o => o.Height).HasColumnType("decimal(18,4)");

        // Unit stored as string (mirrors OrderItemBannerDetail.Unit / other enums) for DB readability.
        builder.Property(o => o.Unit)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32);

        // Money precision (2 decimals), consistent with the other price-tier tables; flows losslessly
        // into the decimal(18,4) OrderItem.UnitPrice snapshot.
        builder.Property(o => o.UnitPrice)
            .HasColumnType("decimal(18,2)");

        builder.HasIndex(o => o.ProductId);

        // Common read order is (product, sort order); a non-unique composite index supports it.
        // No uniqueness on (ProductId, Label/dimensions) — duplicate sizes are an admin concern, and the
        // Badge/print-config tables only enforce uniqueness on true natural keys, which this table lacks.
        builder.HasIndex(o => new { o.ProductId, o.SortOrder });
    }
}
