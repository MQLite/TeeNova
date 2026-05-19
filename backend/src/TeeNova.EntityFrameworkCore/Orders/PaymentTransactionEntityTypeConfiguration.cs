using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Orders;

namespace TeeNova.EntityFrameworkCore.Orders;

public class PaymentTransactionEntityTypeConfiguration : IEntityTypeConfiguration<PaymentTransaction>
{
    public void Configure(EntityTypeBuilder<PaymentTransaction> builder)
    {
        builder.ToTable("PaymentTransactions");

        builder.Property(p => p.Amount)
            .HasColumnType("decimal(18,4)");

        builder.Property(p => p.Method)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(p => p.Reference)
            .HasMaxLength(256);

        builder.Property(p => p.Note)
            .HasMaxLength(1000);

        // OrderId is a foreign-key column with an index. No explicit FK relationship
        // is configured here (consistent with OrderTimelineEntry pattern in this project).
        builder.HasIndex(p => p.OrderId);
    }
}
