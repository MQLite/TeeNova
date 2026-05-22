using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Notifications;

namespace TeeNova.EntityFrameworkCore.Notifications;

public class EmailNotificationLogEntityTypeConfiguration
    : IEntityTypeConfiguration<EmailNotificationLog>
{
    public void Configure(EntityTypeBuilder<EmailNotificationLog> builder)
    {
        builder.ToTable("EmailNotificationLogs");

        builder.Property(e => e.EventType)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(e => e.Recipient)
            .IsRequired()
            .HasMaxLength(256);

        builder.Property(e => e.Subject)
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(e => e.Status)
            .IsRequired()
            .HasMaxLength(16);

        builder.Property(e => e.ErrorMessage)
            .HasMaxLength(2000);

        builder.Property(e => e.SentAt)
            .IsRequired(false);

        builder.Property(e => e.PaymentTransactionId)
            .IsRequired(false);

        // Fast idempotency check: OrderId + EventType lookup
        builder.HasIndex(e => new { e.OrderId, e.EventType })
            .HasDatabaseName("IX_EmailNotificationLogs_OrderId_EventType");

        builder.HasIndex(e => e.OrderId)
            .HasDatabaseName("IX_EmailNotificationLogs_OrderId");

        builder.HasIndex(e => e.PaymentTransactionId)
            .HasDatabaseName("IX_EmailNotificationLogs_PaymentTransactionId");
    }
}
