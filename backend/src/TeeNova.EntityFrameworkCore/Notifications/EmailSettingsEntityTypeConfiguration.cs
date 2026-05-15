using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Notifications;

namespace TeeNova.EntityFrameworkCore.Notifications;

public class EmailSettingsEntityTypeConfiguration : IEntityTypeConfiguration<EmailSettings>
{
    public void Configure(EntityTypeBuilder<EmailSettings> builder)
    {
        builder.ToTable("EmailSettings");

        builder.Property(e => e.AdminNotificationEmail).HasMaxLength(256);
        builder.Property(e => e.ReplyToAddress)        .HasMaxLength(256);
        builder.Property(e => e.SenderName)            .HasMaxLength(128);
        builder.Property(e => e.ShopContactInfo)       .HasMaxLength(1000);
        builder.Property(e => e.ReadyPickupMessage)    .HasMaxLength(500);
        builder.Property(e => e.ReadyShippingMessage)  .HasMaxLength(500);
        builder.Property(e => e.CompletedMessage)      .HasMaxLength(500);
        builder.Property(e => e.AdminOrderBaseUrl)     .HasMaxLength(512);
    }
}
