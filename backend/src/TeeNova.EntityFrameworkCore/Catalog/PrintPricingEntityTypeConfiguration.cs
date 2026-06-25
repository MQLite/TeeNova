using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Catalog;

namespace TeeNova.EntityFrameworkCore.Catalog;

/// <summary>
/// EF mapping for the print-only tiered-pricing model (Jira 9203):
/// <see cref="PrintPricingGroup"/> (quantity-aggregation scope) and
/// <see cref="ProductPrintPriceTier"/> (per-group, per-PrintSize quantity-break print prices),
/// plus the product/size scoped allowed-print-options model (Jira 9204):
/// <see cref="ProductPrintConfigOption"/>.
/// </summary>
public class PrintPricingEntityTypeConfiguration :
    IEntityTypeConfiguration<PrintPricingGroup>,
    IEntityTypeConfiguration<ProductPrintPriceTier>,
    IEntityTypeConfiguration<ProductPrintConfigOption>
{
    public void Configure(EntityTypeBuilder<PrintPricingGroup> builder)
    {
        builder.ToTable("PrintPricingGroups");

        builder.Property(g => g.Name)
            .IsRequired()
            .HasMaxLength(CatalogConsts.MaxPrintPricingGroupNameLength);

        builder.Property(g => g.Code)
            .IsRequired()
            .HasMaxLength(CatalogConsts.MaxPrintPricingGroupCodeLength);

        builder.HasIndex(g => g.Code).IsUnique();
    }

    public void Configure(EntityTypeBuilder<ProductPrintPriceTier> builder)
    {
        builder.ToTable("ProductPrintPriceTiers");

        // Garment-size override discriminator: matches ProductVariant.Size exactly; null = group default.
        builder.Property(t => t.Size)
            .HasMaxLength(CatalogConsts.MaxSizeLength);

        // Print prices are validated to 2 decimals (storefront money precision); flows losslessly
        // into the decimal(18,4) OrderItemPrint snapshot.
        builder.Property(t => t.UnitPrintPrice)
            .HasColumnType("decimal(18,2)");

        // Tiers cascade with their group.
        builder.HasOne<PrintPricingGroup>()
            .WithMany()
            .HasForeignKey(t => t.PrintPricingGroupId)
            .OnDelete(DeleteBehavior.Cascade);

        // PrintSizeId is a plain column (no FK navigation): PrintSize delete is a soft-deactivate,
        // so a hard FK is unnecessary and a cascade would add a multiple-cascade-path. Resolution
        // loads + active-checks the PrintSize at pricing time, so orphan rows simply never resolve.

        builder.HasIndex(t => t.PrintPricingGroupId);

        // Natural key: one price per (group, garment-size scope, print size, quantity break).
        // HasFilter(null) overrides EF's default "Size IS NOT NULL" filter so group-default rows
        // (Size == null) are covered by the unique constraint too.
        builder.HasIndex(t => new { t.PrintPricingGroupId, t.Size, t.PrintSizeId, t.MinQuantity })
            .IsUnique()
            .HasFilter(null);
    }

    public void Configure(EntityTypeBuilder<ProductPrintConfigOption> builder)
    {
        builder.ToTable("ProductPrintConfigOptions");

        // Garment-size override discriminator: matches ProductVariant.Size; null = product default.
        builder.Property(o => o.Size)
            .HasMaxLength(CatalogConsts.MaxSizeLength);

        // Options cascade with their product.
        builder.HasOne<Product>()
            .WithMany()
            .HasForeignKey(o => o.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        // PrintAreaId / PrintSizeId are plain columns (no FK navigation): print config is
        // soft-deactivated, so a hard FK is unnecessary and resolution active-checks at runtime.

        builder.HasIndex(o => o.ProductId);

        // Natural key: one row per (product, garment-size scope, print area, print size).
        // HasFilter(null) covers product-default rows (Size == null) under the unique constraint too.
        builder.HasIndex(o => new { o.ProductId, o.Size, o.PrintAreaId, o.PrintSizeId })
            .IsUnique()
            .HasFilter(null);
    }
}
