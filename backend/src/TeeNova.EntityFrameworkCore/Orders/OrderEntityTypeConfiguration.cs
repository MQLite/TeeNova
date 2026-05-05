using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Orders;
using TeeNova.PrintConfig;

namespace TeeNova.EntityFrameworkCore.Orders;

public class OrderEntityTypeConfiguration :
    IEntityTypeConfiguration<Order>,
    IEntityTypeConfiguration<OrderItem>,
    IEntityTypeConfiguration<OrderItemPositionAsset>,
    IEntityTypeConfiguration<OrderItemPrint>,
    IEntityTypeConfiguration<OrderTimelineEntry>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Orders");

        builder.Property(o => o.OrderNumber)
            .IsRequired()
            .HasMaxLength(32);

        builder.HasIndex(o => o.OrderNumber).IsUnique();

        builder.Property(o => o.CustomerName)
            .HasMaxLength(256);

        builder.Property(o => o.CustomerEmail)
            .IsRequired()
            .HasMaxLength(256);

        builder.Property(o => o.TotalAmount)
            .HasColumnType("decimal(18,4)");

        builder.Property(o => o.Status)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(o => o.AdminNotes)
            .HasMaxLength(4000);

        builder.Property(o => o.IsApprovedForPrinting)
            .HasDefaultValue(false);

        builder.Property(o => o.IsDesignReviewed)
            .HasDefaultValue(false);

        builder.Property(o => o.IsPrintPositionConfirmed)
            .HasDefaultValue(false);

        builder.Property(o => o.IsFileDownloaded)
            .HasDefaultValue(false);

        builder.Property(o => o.IsGarmentConfirmed)
            .HasDefaultValue(false);

        builder.Property(o => o.IsReadyToPrint)
            .HasDefaultValue(false);

        builder.Property(o => o.DeliveryMethod)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired(false);

        // Owned value object — stored as columns in the Orders table
        builder.OwnsOne(o => o.ShippingAddress, sa =>
        {
            sa.Property(a => a.FullName).HasMaxLength(256).IsRequired();
            sa.Property(a => a.AddressLine1).HasMaxLength(512).IsRequired();
            sa.Property(a => a.AddressLine2).HasMaxLength(512);
            sa.Property(a => a.City).HasMaxLength(128).IsRequired();
            sa.Property(a => a.State).HasMaxLength(128).IsRequired(false);
            sa.Property(a => a.PostalCode).HasMaxLength(32).IsRequired();
            sa.Property(a => a.Country).HasMaxLength(64).IsRequired();
            sa.Property(a => a.Phone).HasMaxLength(32);
        });

        builder.HasMany(o => o.Items)
            .WithOne()
            .HasForeignKey(i => i.OrderId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    public void Configure(EntityTypeBuilder<OrderItem> builder)
    {
        builder.ToTable("OrderItems");

        builder.Property(i => i.ProductName).IsRequired().HasMaxLength(256);
        builder.Property(i => i.VariantLabel).IsRequired().HasMaxLength(128);
        builder.Property(i => i.UnitPrice).HasColumnType("decimal(18,4)");

        builder.HasMany(i => i.PositionAssets)
            .WithOne()
            .HasForeignKey(p => p.OrderItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(i => i.Prints)
            .WithOne()
            .HasForeignKey(p => p.OrderItemId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    public void Configure(EntityTypeBuilder<OrderItemPositionAsset> builder)
    {
        builder.ToTable("OrderItemPositionAssets");

        builder.Property(p => p.Position)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(p => p.UploadedAssetUrl).HasMaxLength(1024);
        builder.Property(p => p.DesignNote).HasMaxLength(2000);

        builder.HasIndex(p => new { p.OrderItemId, p.Position }).IsUnique();
    }

    public void Configure(EntityTypeBuilder<OrderItemPrint> builder)
    {
        builder.ToTable("OrderItemPrints");

        // FK to PrintArea / PrintSize — no cascade (config data must not cascade into orders)
        builder.HasOne<PrintArea>()
            .WithMany()
            .HasForeignKey(p => p.PrintAreaId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<PrintSize>()
            .WithMany()
            .HasForeignKey(p => p.PrintSizeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Snapshot strings — reuse PrintConfig max lengths for consistency
        builder.Property(p => p.PrintAreaName)
            .IsRequired()
            .HasMaxLength(PrintConfigConsts.MaxNameLength);
        builder.Property(p => p.PrintAreaCode)
            .IsRequired()
            .HasMaxLength(PrintConfigConsts.MaxCodeLength);
        builder.Property(p => p.PrintAreaPrice)
            .HasColumnType("decimal(18,4)");

        builder.Property(p => p.PrintSizeName)
            .IsRequired()
            .HasMaxLength(PrintConfigConsts.MaxNameLength);
        builder.Property(p => p.PrintSizeCode)
            .IsRequired()
            .HasMaxLength(PrintConfigConsts.MaxCodeLength);
        builder.Property(p => p.PrintSizePrice)
            .HasColumnType("decimal(18,4)");

        builder.Property(p => p.Notes).HasMaxLength(2000);

        builder.HasIndex(p => p.OrderItemId);
        builder.HasIndex(p => p.PrintAreaId);
        builder.HasIndex(p => p.PrintSizeId);
    }

    public void Configure(EntityTypeBuilder<OrderTimelineEntry> builder)
    {
        builder.ToTable("OrderTimelineEntries");

        builder.Property(e => e.Description)
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(e => e.EventType)
            .HasConversion<string>()
            .HasMaxLength(64);

        builder.Property(e => e.Status)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.HasIndex(e => e.OrderId);
    }
}
