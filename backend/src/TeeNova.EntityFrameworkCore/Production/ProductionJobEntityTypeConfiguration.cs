using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Production;

namespace TeeNova.EntityFrameworkCore.Production;

public class ProductionJobEntityTypeConfiguration : IEntityTypeConfiguration<ProductionJob>
{
    public void Configure(EntityTypeBuilder<ProductionJob> builder)
    {
        builder.ToTable("ProductionJobs");

        builder.Property(j => j.Status)
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(j => j.PrinterReference).HasMaxLength(256);
        builder.Property(j => j.Notes).HasMaxLength(2000);

        builder.HasIndex(j => j.OrderId);
    }
}
