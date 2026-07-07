using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Payments;

namespace TeeNova.EntityFrameworkCore.Payments;

public class PaymentWebhookEventEntityTypeConfiguration
    : IEntityTypeConfiguration<PaymentWebhookEvent>
{
    public void Configure(EntityTypeBuilder<PaymentWebhookEvent> builder)
    {
        builder.ToTable("PaymentWebhookEvents");

        builder.Property(e => e.Provider)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(e => e.ProviderEventId)
            .IsRequired()
            .HasMaxLength(256);

        builder.Property(e => e.ProviderEventType)
            .HasMaxLength(128);

        builder.Property(e => e.ProviderSessionId)
            .HasMaxLength(256);

        builder.Property(e => e.PaymentIntentId)
            .HasMaxLength(256);

        builder.Property(e => e.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(e => e.Amount)
            .HasColumnType("decimal(18,4)");

        builder.Property(e => e.Currency)
            .HasMaxLength(10);

        builder.Property(e => e.RejectionCode)
            .HasMaxLength(128);

        builder.Property(e => e.Message)
            .HasMaxLength(512);

        // First replay guard: at most one durable record per provider event ID.
        builder.HasIndex(e => new { e.Provider, e.ProviderEventId })
            .IsUnique()
            .HasDatabaseName("IX_PaymentWebhookEvents_Provider_ProviderEventId");

        builder.HasIndex(e => e.ProviderSessionId)
            .HasDatabaseName("IX_PaymentWebhookEvents_ProviderSessionId");

        builder.HasIndex(e => e.OrderId)
            .HasDatabaseName("IX_PaymentWebhookEvents_OrderId");

        builder.HasIndex(e => e.Status)
            .HasDatabaseName("IX_PaymentWebhookEvents_Status");

        builder.HasIndex(e => e.RequiresManualReview)
            .HasDatabaseName("IX_PaymentWebhookEvents_RequiresManualReview");
    }
}
