using Microsoft.EntityFrameworkCore;
using TeeNova.AiOrderImports;
using TeeNova.Auth;
using TeeNova.Catalog;
using TeeNova.Customization;
using TeeNova.Enquiries;
using TeeNova.Inventory;
using TeeNova.Notifications;
using TeeNova.Orders;
using TeeNova.Payments;
using TeeNova.Portfolio;
using TeeNova.PrintConfig;
using TeeNova.Production;
using Volo.Abp.Data;
using Volo.Abp.EntityFrameworkCore;

namespace TeeNova.EntityFrameworkCore;

[ConnectionStringName("Default")]
public class TeeNovaDbContext : AbpDbContext<TeeNovaDbContext>
{
    // AI order imports
    public DbSet<AiOrderImport> AiOrderImports { get; set; }
    public DbSet<AiOrderSourceDocument> AiOrderSourceDocuments { get; set; }
    public DbSet<AiOrderProcessingAttempt> AiOrderProcessingAttempts { get; set; }
    public DbSet<AiOrderImportRevision> AiOrderImportRevisions { get; set; }
    public DbSet<AiOrderReviewEvent> AiOrderReviewEvents { get; set; }
    public DbSet<AiOrderSourceAccessAudit> AiOrderSourceAccessAudits { get; set; }
    public DbSet<AiOrderOperationalEvent> AiOrderOperationalEvents { get; set; }

    // Auth
    public DbSet<AdminUser> AdminUsers { get; set; }

    // Catalog
    public DbSet<Product> Products { get; set; }
    public DbSet<ProductVariant> ProductVariants { get; set; }
    public DbSet<ProductImage> ProductImages { get; set; }
    public DbSet<ProductPriceTier> ProductPriceTiers { get; set; }
    public DbSet<ProductQuantityPriceTier> ProductQuantityPriceTiers { get; set; }
    public DbSet<ProductFixedSizePriceOption> ProductFixedSizePriceOptions { get; set; }
    public DbSet<PrintPricingGroup> PrintPricingGroups { get; set; }
    public DbSet<ProductPrintPriceTier> ProductPrintPriceTiers { get; set; }
    public DbSet<ProductPrintConfigOption> ProductPrintConfigOptions { get; set; }

    // Customization
    public DbSet<UploadedAsset> UploadedAssets { get; set; }

    // Orders
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<OrderItemPrint> OrderItemPrints { get; set; }
    public DbSet<OrderItemBannerDetail> OrderItemBannerDetails { get; set; }
    public DbSet<OrderAdHocProductSnapshot> OrderAdHocProductSnapshots { get; set; }
    public DbSet<OrderTimelineEntry> OrderTimelineEntries { get; set; }
    public DbSet<PaymentTransaction> PaymentTransactions { get; set; }
    public DbSet<OrderPriceAdjustment> OrderPriceAdjustments { get; set; }

    // PrintConfig
    public DbSet<PrintArea>           PrintAreas           { get; set; }
    public DbSet<PrintSize>           PrintSizes           { get; set; }
    public DbSet<PrintAreaSizeOption> PrintAreaSizeOptions { get; set; }

    // Production
    public DbSet<ProductionJob> ProductionJobs { get; set; }

    // Payments
    public DbSet<OnlinePaymentSession>   OnlinePaymentSessions   { get; set; }
    public DbSet<PaymentWebhookEvent>    PaymentWebhookEvents    { get; set; }
    public DbSet<PaymentProviderSetting> PaymentProviderSettings { get; set; }

    // Notifications
    public DbSet<EmailNotificationLog> EmailNotificationLogs { get; set; }
    public DbSet<EmailSettings>        EmailSettings         { get; set; }

    // Inventory
    public DbSet<InventorySettings>    InventorySettings     { get; set; }

    // Enquiries (Jira 9512)
    public DbSet<BannerQuoteRequest>   BannerQuoteRequests   { get; set; }
    public DbSet<QuoteRequest> QuoteRequests { get; set; }
    public DbSet<QuoteRequestAttachment> QuoteRequestAttachments { get; set; }

    // Portfolio (Jira 10302)
    public DbSet<PortfolioItem> PortfolioItems { get; set; }
    public DbSet<PortfolioItemImage> PortfolioItemImages { get; set; }

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
