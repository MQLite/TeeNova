using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Reception;

namespace TeeNova.EntityFrameworkCore.Reception;

public sealed class ReceptionSheetPdfConfiguration : IEntityTypeConfiguration<ReceptionSheetPdf>
{
    public void Configure(EntityTypeBuilder<ReceptionSheetPdf> builder)
    {
        builder.ToTable("ReceptionSheetPdfs");
        builder.Property(x => x.Version).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Template).HasMaxLength(64).IsRequired();
        builder.HasIndex(x => new { x.SheetId, x.Version, x.Template }).IsUnique();
        builder.HasOne<ReceptionSheet>().WithMany().HasForeignKey(x => x.SheetId).OnDelete(DeleteBehavior.Cascade);
    }
}
