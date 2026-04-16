using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Customization;

namespace TeeNova.EntityFrameworkCore.Customization;

public class UploadedAssetEntityTypeConfiguration : IEntityTypeConfiguration<UploadedAsset>
{
    public void Configure(EntityTypeBuilder<UploadedAsset> builder)
    {
        builder.ToTable("UploadedAssets");
        builder.Property(a => a.OriginalFileName).IsRequired().HasMaxLength(512);
        builder.Property(a => a.StoredFileUrl).IsRequired().HasMaxLength(1024);
        builder.Property(a => a.ContentType).IsRequired().HasMaxLength(128);

        // Stored as int; default 0 = CustomerDesign so existing rows stay correct.
        builder.Property(a => a.AssetType)
            .HasConversion<int>()
            .HasDefaultValue(TeeNova.Files.AssetType.CustomerDesign);
    }
}
