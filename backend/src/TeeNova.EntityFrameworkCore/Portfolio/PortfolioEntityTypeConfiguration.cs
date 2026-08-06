using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TeeNova.EntityFrameworkCore.Portfolio;

public sealed class PortfolioEntityTypeConfiguration : IEntityTypeConfiguration<TeeNova.Portfolio.PortfolioItem>, IEntityTypeConfiguration<TeeNova.Portfolio.PortfolioItemImage>
{
    public void Configure(EntityTypeBuilder<TeeNova.Portfolio.PortfolioItem> builder)
    {
        builder.ToTable("PortfolioItems");
        builder.Property(x => x.Title).IsRequired().HasMaxLength(160);
        builder.Property(x => x.Slug).IsRequired().HasMaxLength(160);
        builder.Property(x => x.ShortCaption).IsRequired().HasMaxLength(320);
        builder.Property(x => x.LongDescription).HasMaxLength(4000);
        builder.Property(x => x.ServiceType).HasConversion<string>().HasMaxLength(64);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.HasIndex(x => x.Slug).IsUnique();
        builder.HasIndex(x => new { x.Status, x.SortOrder });
        builder.HasMany(x => x.Images).WithOne(x => x.PortfolioItem).HasForeignKey(x => x.PortfolioItemId).OnDelete(DeleteBehavior.Cascade);
    }

    public void Configure(EntityTypeBuilder<TeeNova.Portfolio.PortfolioItemImage> builder)
    {
        builder.ToTable("PortfolioItemImages");
        builder.Property(x => x.ObjectKey).IsRequired().IsFixedLength().HasMaxLength(32);
        builder.Property(x => x.OriginalFileName).IsRequired().HasMaxLength(255);
        builder.Property(x => x.ContentType).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Sha256).IsRequired().IsFixedLength().HasMaxLength(64);
        builder.Property(x => x.AltText).IsRequired().HasMaxLength(300);
        builder.Property(x => x.PermissionSource).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.PermissionReference).IsRequired().HasMaxLength(500);
        builder.HasIndex(x => x.ObjectKey).IsUnique();
        builder.HasIndex(x => new { x.PortfolioItemId, x.SortOrder });
        builder.HasIndex(x => x.PortfolioItemId).IsUnique().HasFilter("[IsPrimary] = 1");
    }
}
