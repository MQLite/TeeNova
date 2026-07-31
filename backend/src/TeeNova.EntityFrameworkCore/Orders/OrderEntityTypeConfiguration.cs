using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Orders;
using TeeNova.PrintConfig;

namespace TeeNova.EntityFrameworkCore.Orders;

public class OrderEntityTypeConfiguration :
    IEntityTypeConfiguration<Order>,
    IEntityTypeConfiguration<OrderItem>,
    IEntityTypeConfiguration<OrderItemPrint>,
    IEntityTypeConfiguration<OrderItemBannerDetail>,
    IEntityTypeConfiguration<OrderAdHocProductSnapshot>,
    IEntityTypeConfiguration<OrderTimelineEntry>,
    IEntityTypeConfiguration<OrderPriceAdjustment>
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

        builder.Property(o => o.DeliveryMethod)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired(false);

        builder.Property(o => o.Source)
            .HasConversion<string>()
            .HasMaxLength(32)
            .HasDefaultValue(OrderSource.Checkout)
            .IsRequired();
        builder.Property(o => o.SourceAiOrderConfirmedCanonicalSha256)
            .HasMaxLength(64)
            .IsFixedLength();
        builder.Property(o => o.SourceAiOrderMaterializationOperationKey)
            .HasMaxLength(128);
        builder.Property(o => o.AiWrittenOrderTotal).HasColumnType("decimal(18,4)");
        builder.Property(o => o.AiCalculatedMaterializationTotal).HasColumnType("decimal(18,4)");
        builder.Property(o => o.AiPricingMode).HasMaxLength(32);
        builder.Property(o => o.AiPricingReason).HasMaxLength(1000);
        builder.HasIndex(o => o.SourceAiOrderImportId)
            .IsUnique()
            .HasFilter("[SourceAiOrderImportId] IS NOT NULL")
            .HasDatabaseName("UX_Orders_SourceAiOrderImportId");
        builder.HasIndex(o => o.SourceAiOrderMaterializationOperationKey)
            .IsUnique()
            .HasFilter("[SourceAiOrderMaterializationOperationKey] IS NOT NULL")
            .HasDatabaseName("UX_Orders_AiMaterializationOperationKey");

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

        // Payment snapshot fields
        builder.Property(o => o.PaymentStatus)
            .HasConversion<string>()
            .HasMaxLength(32)
            .HasDefaultValue(PaymentStatus.Unpaid);

        // No HasDefaultValue here — CLR default (DepositThenBalance=0) is used for migration
        // column addition. The backfill SQL sets the correct value for all existing rows,
        // and Phase 12A-2 always sets the value explicitly in CreateOrderAsync.
        builder.Property(o => o.PaymentRequirementType)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(o => o.RequiredDepositAmount)
            .HasColumnType("decimal(18,4)");

        builder.Property(o => o.RequiredPaymentAmount)
            .HasColumnType("decimal(18,4)");

        builder.Property(o => o.PaidAmount)
            .HasColumnType("decimal(18,4)");

        builder.Property(o => o.BalanceAmount)
            .HasColumnType("decimal(18,4)");

        // DepositPaidAt and FullyPaidAt are DateTime? — EF infers datetime2 nullable, no config needed.

        builder.Property(o => o.LastPaymentMethod)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired(false);

        builder.Property(o => o.LastPaymentReference)
            .HasMaxLength(256);

        builder.Property(o => o.LastPaymentNote)
            .HasMaxLength(1000);

        builder.HasIndex(o => o.PaymentStatus);

        builder.HasMany(o => o.Items)
            .WithOne()
            .HasForeignKey(i => i.OrderId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(o => o.AdHocProductSnapshots)
            .WithOne()
            .HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    public void Configure(EntityTypeBuilder<OrderItem> builder)
    {
        builder.ToTable("OrderItems");

        builder.Property(i => i.ProductName).IsRequired().HasMaxLength(256);
        builder.Property(i => i.ProductSource)
            .HasConversion<string>()
            .HasMaxLength(32)
            .HasDefaultValue(OrderItemProductSource.Catalogue)
            .IsRequired();
        builder.Property(i => i.ColourSnapshot).HasMaxLength(128);
        builder.Property(i => i.SizeSnapshot).HasMaxLength(128);
        // VariantLabel + ProductVariantId are now nullable (Jira 9503): null for non-garment items
        // (Badge has no color/size variant). Garment items still carry both.
        builder.Property(i => i.VariantLabel).IsRequired(false).HasMaxLength(128);
        builder.Property(i => i.UnitPrice).HasColumnType("decimal(18,4)");

        // Model snapshot (Jira 9503) — stored as strings with garment defaults so existing rows backfill.
        builder.Property(i => i.PricingModel)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32)
            .HasDefaultValue(TeeNova.Catalog.PricingModel.GarmentPrint);
        builder.Property(i => i.ProductKind)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32)
            .HasDefaultValue(TeeNova.Catalog.ProductKind.Garment);

        // Item-level design (Jira 9503) — used by non-garment items (Badge); null for garments.
        builder.Property(i => i.UploadedAssetUrl).HasMaxLength(2048);
        builder.Property(i => i.DesignNote).HasMaxLength(2000);
        // ConfigurationJson reserved for Banner; left unbounded (nvarchar(max)).

        // InventoryDeductedAt is DateTime? — EF infers datetime2 nullable. Idempotency marker
        // for the Jira 9005 post-production deduction.
        builder.Property(i => i.InventoryDeductionEligible)
            .HasDefaultValue(false);

        builder.HasMany(i => i.Prints)
            .WithOne()
            .HasForeignKey(p => p.OrderItemId)
            .OnDelete(DeleteBehavior.Cascade);

        // One-to-one Banner configuration snapshot (Jira 9511). Present only for Banner items;
        // cascade-deleted with the item. FK lives on the dependent (OrderItemBannerDetail.OrderItemId).
        builder.HasOne(i => i.BannerDetail)
            .WithOne()
            .HasForeignKey<OrderItemBannerDetail>(d => d.OrderItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<OrderAdHocProductSnapshot>()
            .WithMany()
            .HasForeignKey(i => i.OrderAdHocProductSnapshotId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.ToTable("OrderItems", table =>
        {
            table.HasCheckConstraint(
                "CK_OrderItems_ProductSource",
                "([ProductSource] = 'Catalogue' AND [ProductId] IS NOT NULL AND [OrderAdHocProductSnapshotId] IS NULL) OR ([ProductSource] = 'AdHoc' AND [ProductId] IS NULL AND [OrderAdHocProductSnapshotId] IS NOT NULL AND [InventoryDeductionEligible] = 0)");
        });
    }

    public void Configure(EntityTypeBuilder<OrderAdHocProductSnapshot> builder)
    {
        builder.ToTable("OrderAdHocProductSnapshots");
        builder.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.WrittenName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Brand).HasMaxLength(128);
        builder.Property(x => x.SupplierName).HasMaxLength(256);
        builder.Property(x => x.SupplierCode).HasMaxLength(128);
        builder.Property(x => x.SupplySource).HasMaxLength(32);
        builder.Property(x => x.InventoryBehavior)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.ConfirmedImportGroupId).HasMaxLength(128).IsRequired();
        builder.HasIndex(x => new { x.OrderId, x.ConfirmedImportGroupId })
            .IsUnique()
            .HasDatabaseName("UX_OrderAdHocProductSnapshots_Order_Group");
    }

    public void Configure(EntityTypeBuilder<OrderItemBannerDetail> builder)
    {
        builder.ToTable("OrderItemBannerDetails");

        // Enum-backed columns stored as strings, consistent with the rest of the project.
        builder.Property(d => d.SizeMode)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32);

        builder.Property(d => d.Unit)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired(false);

        builder.Property(d => d.Material)
            .HasConversion<string>()
            .IsRequired()
            .HasMaxLength(32);

        builder.Property(d => d.Width).HasColumnType("decimal(18,4)");
        builder.Property(d => d.Height).HasColumnType("decimal(18,4)");
        builder.Property(d => d.AreaSquareMetres).HasColumnType("decimal(18,4)");

        builder.Property(d => d.SizeLabel).HasMaxLength(256);
        builder.Property(d => d.MaterialDisplayName).HasMaxLength(128);
        builder.Property(d => d.FinishingOther).HasMaxLength(512);
        builder.Property(d => d.Notes).HasMaxLength(2000);

        // One-to-one: a unique index on the FK enforces at most one detail per order item.
        builder.HasIndex(d => d.OrderItemId).IsUnique();
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

        // Resolved print-tier snapshot (Jira 9203). Defaults to 0 for historical rows added before
        // this column existed; new orders always set the resolved price explicitly.
        builder.Property(p => p.ResolvedUnitPrintPrice)
            .HasColumnType("decimal(18,4)")
            .HasDefaultValue(0m);

        builder.Property(p => p.Notes).HasMaxLength(2000);
        builder.Property(p => p.UploadedAssetUrl).HasMaxLength(1024);
        builder.Property(p => p.DesignNote).HasMaxLength(2000);

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

    public void Configure(EntityTypeBuilder<OrderPriceAdjustment> builder)
    {
        builder.ToTable("OrderPriceAdjustments");

        builder.Property(a => a.OldTotalAmount)
            .HasColumnType("decimal(18,4)")
            .IsRequired();

        builder.Property(a => a.NewTotalAmount)
            .HasColumnType("decimal(18,4)")
            .IsRequired();

        builder.Property(a => a.AdjustmentAmount)
            .HasColumnType("decimal(18,4)")
            .IsRequired();

        builder.Property(a => a.Reason)
            .IsRequired()
            .HasMaxLength(1000);

        builder.Property(a => a.AdjustedByUser)
            .HasMaxLength(256)
            .IsRequired(false);

        builder.HasOne<Order>()
            .WithMany()
            .HasForeignKey(a => a.OrderId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(a => a.OrderId);
    }
}
