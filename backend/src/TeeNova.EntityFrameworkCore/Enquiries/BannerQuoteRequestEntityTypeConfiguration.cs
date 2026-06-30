using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Enquiries;

namespace TeeNova.EntityFrameworkCore.Enquiries;

public class BannerQuoteRequestEntityTypeConfiguration : IEntityTypeConfiguration<BannerQuoteRequest>
{
    public void Configure(EntityTypeBuilder<BannerQuoteRequest> builder)
    {
        builder.ToTable("BannerQuoteRequests");

        builder.Property(r => r.ProductNameSnapshot).IsRequired().HasMaxLength(256);

        builder.Property(r => r.CustomerName).IsRequired().HasMaxLength(256);
        builder.Property(r => r.CustomerEmail).IsRequired().HasMaxLength(256);
        builder.Property(r => r.CustomerPhone).HasMaxLength(32);
        builder.Property(r => r.Message).HasMaxLength(2000);

        builder.Property(r => r.UploadedAssetUrl).HasMaxLength(2048);
        builder.Property(r => r.DesignNote).HasMaxLength(2000);

        // Banner config — enums as strings, consistent with OrderItemBannerDetail (Jira 9511).
        builder.Property(r => r.SizeMode).HasConversion<string>().IsRequired().HasMaxLength(32);
        builder.Property(r => r.Unit).HasConversion<string>().HasMaxLength(32).IsRequired(false);
        builder.Property(r => r.Material).HasConversion<string>().IsRequired().HasMaxLength(32);

        builder.Property(r => r.Width).HasColumnType("decimal(18,4)");
        builder.Property(r => r.Height).HasColumnType("decimal(18,4)");
        builder.Property(r => r.AreaSquareMetres).HasColumnType("decimal(18,4)");

        builder.Property(r => r.SizeLabel).HasMaxLength(256);
        builder.Property(r => r.MaterialDisplayName).HasMaxLength(128);
        builder.Property(r => r.FinishingOther).HasMaxLength(512);
        builder.Property(r => r.BannerNotes).HasMaxLength(2000);

        builder.Property(r => r.Status).HasConversion<string>().IsRequired().HasMaxLength(32);

        builder.HasIndex(r => r.ProductId);
        builder.HasIndex(r => r.Status);
    }
}
