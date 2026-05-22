using Microsoft.EntityFrameworkCore;
using TeeNova.Catalog;
using TeeNova.Customization;
using TeeNova.Notifications;
using TeeNova.Orders;
using TeeNova.Payments;
using TeeNova.PrintConfig;
using TeeNova.Production;
using Volo.Abp.Data;
using Volo.Abp.EntityFrameworkCore;

namespace TeeNova.EntityFrameworkCore;

[ConnectionStringName("Default")]
public class TeeNovaDbContext : AbpDbContext<TeeNovaDbContext>
{
    // Catalog
    public DbSet<Product> Products { get; set; }
    public DbSet<ProductVariant> ProductVariants { get; set; }
    public DbSet<ProductImage> ProductImages { get; set; }

    // Customization
    public DbSet<UploadedAsset> UploadedAssets { get; set; }

    // Orders
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<OrderItemPrint> OrderItemPrints { get; set; }
    public DbSet<OrderTimelineEntry> OrderTimelineEntries { get; set; }
    public DbSet<PaymentTransaction> PaymentTransactions { get; set; }

    // PrintConfig
    public DbSet<PrintArea>           PrintAreas           { get; set; }
    public DbSet<PrintSize>           PrintSizes           { get; set; }
    public DbSet<PrintAreaSizeOption> PrintAreaSizeOptions { get; set; }

    // Production
    public DbSet<ProductionJob> ProductionJobs { get; set; }

    // Payments
    public DbSet<OnlinePaymentSession> OnlinePaymentSessions { get; set; }

    // Notifications
    public DbSet<EmailNotificationLog> EmailNotificationLogs { get; set; }
    public DbSet<EmailSettings>        EmailSettings         { get; set; }

    public TeeNovaDbContext(DbContextOptions<TeeNovaDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.HasDefaultSchema("teenova");

        builder.ApplyConfigurationsFromAssembly(typeof(TeeNovaDbContext).Assembly);
    }
}
