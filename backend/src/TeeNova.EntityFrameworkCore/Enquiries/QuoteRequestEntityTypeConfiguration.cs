using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Enquiries;

namespace TeeNova.EntityFrameworkCore.Enquiries;

public sealed class QuoteRequestEntityTypeConfiguration : IEntityTypeConfiguration<QuoteRequest>
{
    public void Configure(EntityTypeBuilder<QuoteRequest> builder)
    {
        builder.ToTable("QuoteRequests");
        builder.Property(x => x.Reference).IsRequired().HasMaxLength(16);
        builder.Property(x => x.ServiceType).HasConversion<string>().IsRequired().HasMaxLength(40);
        builder.Property(x => x.ServiceTypeOther).HasMaxLength(120);
        builder.Property(x => x.ProductNameSnapshot).HasMaxLength(200);
        builder.Property(x => x.Width).HasColumnType("decimal(18,4)");
        builder.Property(x => x.Height).HasColumnType("decimal(18,4)");
        builder.Property(x => x.DimensionUnit).HasConversion<string>().HasMaxLength(24);
        builder.Property(x => x.RequiredDate).HasColumnType("date");
        builder.Property(x => x.FulfilmentPreference).HasConversion<string>().IsRequired().HasMaxLength(24);
        builder.Property(x => x.DeliverySuburb).HasMaxLength(120);
        builder.Property(x => x.CustomerName).IsRequired().HasMaxLength(120);
        builder.Property(x => x.CustomerEmail).IsRequired().HasMaxLength(256);
        builder.Property(x => x.CustomerPhone).HasMaxLength(40);
        builder.Property(x => x.OrganisationName).HasMaxLength(160);
        builder.Property(x => x.Notes).HasMaxLength(2000);
        builder.Property(x => x.Status).HasConversion<string>().IsRequired().HasMaxLength(24);
        builder.Property(x => x.SubmissionHash).IsRequired().IsFixedLength().HasMaxLength(64);
        builder.Property(x => x.SubmissionKey).HasMaxLength(128);
        builder.Property(x => x.SourcePath).HasMaxLength(200);
        builder.Property(x => x.ClientIpHash).IsFixedLength().HasMaxLength(64);
        builder.Property(x => x.InternalNotificationStatus).HasConversion<string>().IsRequired().HasMaxLength(24);
        builder.Property(x => x.CustomerAcknowledgementStatus).HasConversion<string>().IsRequired().HasMaxLength(24);

        builder.HasIndex(x => x.Reference).IsUnique();
        builder.HasIndex(x => x.SubmissionKey).IsUnique().HasFilter("[SubmissionKey] IS NOT NULL");
        builder.HasIndex(x => new { x.SubmissionHash, x.CreationTime });
        builder.HasIndex(x => new { x.Status, x.CreationTime });
        builder.HasMany(x => x.Attachments)
            .WithOne(x => x.QuoteRequest)
            .HasForeignKey(x => x.QuoteRequestId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class QuoteRequestAttachmentEntityTypeConfiguration : IEntityTypeConfiguration<QuoteRequestAttachment>
{
    public void Configure(EntityTypeBuilder<QuoteRequestAttachment> builder)
    {
        builder.ToTable("QuoteRequestAttachments");
        builder.Property(x => x.ObjectKey).IsRequired().HasMaxLength(400);
        builder.Property(x => x.OriginalFileName).IsRequired().HasMaxLength(260);
        builder.Property(x => x.ContentType).IsRequired().HasMaxLength(120);
        builder.Property(x => x.Sha256).IsRequired().IsFixedLength().HasMaxLength(64);
        builder.Property(x => x.UploadTokenHash).IsRequired().IsFixedLength().HasMaxLength(64);
        builder.Property(x => x.ScanStatus).HasConversion<string>().IsRequired().HasMaxLength(24);
        builder.HasIndex(x => x.UploadTokenHash).IsUnique();
        builder.HasIndex(x => new { x.QuoteRequestId, x.CreationTime });
        builder.HasIndex(x => x.StagedUntil).HasFilter("[QuoteRequestId] IS NULL");
    }
}
