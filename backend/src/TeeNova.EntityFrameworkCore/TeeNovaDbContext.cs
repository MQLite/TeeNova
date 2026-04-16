using Microsoft.EntityFrameworkCore;
using TeeNova.Catalog;
using TeeNova.Customization;
using TeeNova.Orders;
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
    public DbSet<OrderItemPositionAsset> OrderItemPositionAssets { get; set; }
    public DbSet<OrderTimelineEntry> OrderTimelineEntries { get; set; }

    // Production
    public DbSet<ProductionJob> ProductionJobs { get; set; }

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
