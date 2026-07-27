using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Payments;

namespace TeeNova.EntityFrameworkCore.Payments;

public class OnlinePaymentSessionEntityTypeConfiguration
    : IEntityTypeConfiguration<OnlinePaymentSession>
{
    public void Configure(EntityTypeBuilder<OnlinePaymentSession> builder)
    {
        builder.ToTable("OnlinePaymentSessions");

        builder.Property(e => e.OrderNumber)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(e => e.Provider)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(e => e.ProviderSessionId)
            .IsRequired()
            .HasMaxLength(256);

        builder.Property(e => e.ProviderCheckoutUrl)
            .IsRequired()
            .HasMaxLength(2048);

        builder.Property(e => e.Amount)
            .HasColumnType("decimal(18,4)");

        builder.Property(e => e.Currency)
            .IsRequired()
            .HasMaxLength(10);

        builder.Property(e => e.Purpose)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(e => e.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(e => e.CompletedAt)
            .IsRequired(false);

        builder.Property(e => e.ProviderPaymentId)
            .HasMaxLength(256);

        builder.Property(e => e.LastProviderEventId)
            .HasMaxLength(256);

        builder.Property(e => e.RawProviderStatus)
            .HasMaxLength(256);

        builder.Property(e => e.PaymentTransactionId)
            .IsRequired(false);

        // ── Immutable pricing snapshot (Phase 2B) ────────────────────────────
        // BaseAmount and SurchargeAmount deliberately match the existing Amount precision so no historical
        // value is ever converted or re-rounded. BaseAmount carries no store default: the migration backfills
        // it from Amount rather than letting existing rows fall to zero.
        builder.Property(e => e.BaseAmount)
            .IsRequired()
            .HasColumnType("decimal(18,4)");

        builder.Property(e => e.SurchargeAmount)
            .IsRequired()
            .HasColumnType("decimal(18,4)")
            .HasDefaultValue(0m);

        builder.Property(e => e.SurchargePercentageBasisPoints)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(e => e.SurchargeFixedAmount)
            .IsRequired()
            .HasColumnType("decimal(18,2)")
            .HasDefaultValue(0m);

        builder.Property(e => e.SurchargeCalculationVersion)
            .IsRequired()
            .HasMaxLength(OnlinePaymentSession.MaxCalculationVersionLength)
            .HasDefaultValue(OnlinePaymentSession.LegacyCalculationVersion);

        // Nullable: the Test/Live mode of a historical session cannot be proven from stored data.
        builder.Property(e => e.ProviderMode)
            .IsRequired(false)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.HasIndex(e => e.OrderId)
            .HasDatabaseName("IX_OnlinePaymentSessions_OrderId");

        builder.HasIndex(e => e.ProviderSessionId)
            .IsUnique()
            .HasDatabaseName("IX_OnlinePaymentSessions_ProviderSessionId");

        builder.HasIndex(e => e.Status)
            .HasDatabaseName("IX_OnlinePaymentSessions_Status");

        builder.HasIndex(e => e.ProviderPaymentId)
            .HasDatabaseName("IX_OnlinePaymentSessions_ProviderPaymentId");

        builder.HasIndex(e => e.LastProviderEventId)
            .HasDatabaseName("IX_OnlinePaymentSessions_LastProviderEventId");
    }
}
