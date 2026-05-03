using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.PrintConfig;

namespace TeeNova.EntityFrameworkCore.PrintConfig;

public class PrintConfigEntityTypeConfiguration :
    IEntityTypeConfiguration<PrintArea>,
    IEntityTypeConfiguration<PrintSize>
{
    public void Configure(EntityTypeBuilder<PrintArea> builder)
    {
        builder.ToTable("PrintAreas");

        builder.Property(a => a.Name).IsRequired().HasMaxLength(PrintConfigConsts.MaxNameLength);
        builder.Property(a => a.Code).IsRequired().HasMaxLength(PrintConfigConsts.MaxCodeLength);
        builder.Property(a => a.BasePrice).HasColumnType("decimal(18,4)");

        builder.HasIndex(a => a.Code).IsUnique();

        // Filtered unique index: allows multiple NULLs, enforces uniqueness among non-null values
        builder.HasIndex(a => a.LegacyPositionValue)
            .IsUnique()
            .HasFilter("[LegacyPositionValue] IS NOT NULL");
    }

    public void Configure(EntityTypeBuilder<PrintSize> builder)
    {
        builder.ToTable("PrintSizes");

        builder.Property(s => s.Name).IsRequired().HasMaxLength(PrintConfigConsts.MaxNameLength);
        builder.Property(s => s.Code).IsRequired().HasMaxLength(PrintConfigConsts.MaxCodeLength);
        builder.Property(s => s.BasePrice).HasColumnType("decimal(18,4)");

        builder.HasIndex(s => s.Code).IsUnique();
    }
}
