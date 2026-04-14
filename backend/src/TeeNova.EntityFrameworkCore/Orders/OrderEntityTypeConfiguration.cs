using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Orders;

namespace TeeNova.EntityFrameworkCore.Orders;

public class OrderEntityTypeConfiguration :
    IEntityTypeConfiguration<Order>,
    IEntityTypeConfiguration<OrderItem>
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

        // Owned value object — stored as columns in the Orders table
        builder.OwnsOne(o => o.ShippingAddress, sa =>
        {
            sa.Property(a => a.FullName).HasMaxLength(256).IsRequired();
            sa.Property(a => a.AddressLine1).HasMaxLength(512).IsRequired();
            sa.Property(a => a.AddressLine2).HasMaxLength(512);
            sa.Property(a => a.City).HasMaxLength(128).IsRequired();
            sa.Property(a => a.State).HasMaxLength(128).IsRequired();
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

        builder.Property(i => i.UploadedAssetUrl).HasMaxLength(1024);

        builder.Property(i => i.PrintPosition)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(i => i.DesignNote).HasMaxLength(2000);
        builder.Property(i => i.PrintPositionsJson).HasColumnType("nvarchar(max)");
    }
}
