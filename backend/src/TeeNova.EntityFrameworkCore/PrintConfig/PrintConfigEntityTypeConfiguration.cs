using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.PrintConfig;

namespace TeeNova.EntityFrameworkCore.PrintConfig;

public class PrintConfigEntityTypeConfiguration :
    IEntityTypeConfiguration<PrintArea>,
    IEntityTypeConfiguration<PrintSize>,
    IEntityTypeConfiguration<PrintAreaSizeOption>
{
    public void Configure(EntityTypeBuilder<PrintArea> builder)
    {
        builder.ToTable("PrintAreas");

        builder.Property(a => a.Name).IsRequired().HasMaxLength(PrintConfigConsts.MaxNameLength);
        builder.Property(a => a.Code).IsRequired().HasMaxLength(PrintConfigConsts.MaxCodeLength);
        builder.Property(a => a.BasePrice).HasColumnType("decimal(18,4)");

        builder.HasIndex(a => a.Code).IsUnique();
    }

    public void Configure(EntityTypeBuilder<PrintSize> builder)
    {
        builder.ToTable("PrintSizes");

        builder.Property(s => s.Name).IsRequired().HasMaxLength(PrintConfigConsts.MaxNameLength);
        builder.Property(s => s.Code).IsRequired().HasMaxLength(PrintConfigConsts.MaxCodeLength);
        builder.Property(s => s.BasePrice).HasColumnType("decimal(18,4)");

        builder.HasIndex(s => s.Code).IsUnique();
    }

    public void Configure(EntityTypeBuilder<PrintAreaSizeOption> builder)
    {
        builder.ToTable("PrintAreaSizeOptions");

        builder.Property(o => o.PrintAreaId).IsRequired();
        builder.Property(o => o.PrintSizeId).IsRequired();
        builder.Property(o => o.IsActive).IsRequired();
        builder.Property(o => o.SortOrder).IsRequired();

        builder.HasIndex(o => new { o.PrintAreaId, o.PrintSizeId }).IsUnique();

        builder.HasOne<PrintArea>()
            .WithMany()
            .HasForeignKey(o => o.PrintAreaId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<PrintSize>()
            .WithMany()
            .HasForeignKey(o => o.PrintSizeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
