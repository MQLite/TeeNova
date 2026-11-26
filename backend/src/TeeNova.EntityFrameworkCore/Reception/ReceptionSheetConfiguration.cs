using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Reception;

namespace TeeNova.EntityFrameworkCore.Reception;

public sealed class ReceptionSheetConfiguration : IEntityTypeConfiguration<ReceptionSheet>
{
    public void Configure(EntityTypeBuilder<ReceptionSheet> builder)
    {
        builder.ToTable("ReceptionSheets");
        builder.Property(x => x.TotalPrice).HasPrecision(10, 2);
        builder.Property(x => x.Deposit).HasPrecision(10, 2);
        builder.Property(x => x.PrintEstimate).HasMaxLength(ReceptionSheet.MaxPrintEstimateLength);
        builder.HasQueryFilter(sheet => sheet.Stage != ReceptionStage.Deleted);
        builder.HasIndex(x => new { x.Stage, x.PickupDate });
    }
}
