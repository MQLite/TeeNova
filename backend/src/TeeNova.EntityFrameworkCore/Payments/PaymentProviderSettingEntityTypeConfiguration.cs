using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Payments;

namespace TeeNova.EntityFrameworkCore.Payments;

public class PaymentProviderSettingEntityTypeConfiguration
    : IEntityTypeConfiguration<PaymentProviderSetting>
{
    public void Configure(EntityTypeBuilder<PaymentProviderSetting> builder)
    {
        builder.ToTable("PaymentProviderSettings");

        builder.Property(e => e.Provider)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(e => e.Mode)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(16);

        builder.Property(e => e.Currency)
            .IsRequired()
            .HasMaxLength(10);

        builder.Property(e => e.PublishableKey)
            .HasMaxLength(256);

        // Ciphertext blobs — generous length to accommodate the encrypted+base64 payload.
        builder.Property(e => e.SecretKeyCipherText)
            .HasMaxLength(2048);

        builder.Property(e => e.WebhookSecretCipherText)
            .HasMaxLength(2048);

        builder.Property(e => e.SecretKeyLast4)
            .HasMaxLength(8);

        builder.Property(e => e.WebhookSecretLast4)
            .HasMaxLength(8);

        builder.Property(e => e.SuccessReturnBaseUrl)
            .HasMaxLength(512);

        builder.Property(e => e.CancelReturnBaseUrl)
            .HasMaxLength(512);

        builder.Property(e => e.LastValidationStatus)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(16);

        builder.Property(e => e.LastValidationMessageCode)
            .HasMaxLength(128);

        // At most one persisted configuration per (provider, mode) — the runtime resolver expects a single
        // active Stripe/Test row.
        builder.HasIndex(e => new { e.Provider, e.Mode })
            .IsUnique()
            .HasDatabaseName("IX_PaymentProviderSettings_Provider_Mode");
    }
}
