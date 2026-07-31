using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.AiOrderImports;

namespace TeeNova.EntityFrameworkCore.AiOrderImports;

public sealed class AiOrderImportEntityTypeConfiguration :
    IEntityTypeConfiguration<AiOrderImport>,
    IEntityTypeConfiguration<AiOrderSourceDocument>,
    IEntityTypeConfiguration<AiOrderProcessingAttempt>,
    IEntityTypeConfiguration<AiOrderImportRevision>,
    IEntityTypeConfiguration<AiOrderReviewEvent>,
    IEntityTypeConfiguration<AiOrderSourceAccessAudit>,
    IEntityTypeConfiguration<AiOrderOperationalEvent>
{
    public void Configure(EntityTypeBuilder<AiOrderImport> builder)
    {
        builder.ToTable("AiOrderImports", table =>
        {
            table.HasCheckConstraint(
                "CK_AiOrderImports_CurrentRevision",
                "[CurrentRevision] >= 0");
            table.HasCheckConstraint(
                "CK_AiOrderImports_ConfirmationMetadata",
                "([Status] <> 'Confirmed') OR ([ConfirmedAt] IS NOT NULL AND [ConfirmedByAdminId] IS NOT NULL AND [ConfirmedRevision] = [CurrentRevision] AND [ConfirmedCanonicalSha256] IS NOT NULL AND [ConfirmedReviewVersion] IS NOT NULL AND [ConfirmedBlockingIssueCount] = 0 AND [ConfirmationOperationKey] IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_AiOrderImports_MaterializationMetadata",
                "([FormalOrderId] IS NULL AND [MaterializationOperationKey] IS NULL AND [MaterializationRequestHash] IS NULL AND [MaterializedByAdminId] IS NULL AND [MaterializedAt] IS NULL) OR ([FormalOrderId] IS NOT NULL AND [MaterializationOperationKey] IS NOT NULL AND [MaterializationRequestHash] IS NOT NULL AND [MaterializedByAdminId] IS NOT NULL AND [MaterializedAt] IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_AiOrderImports_CancellationMetadata",
                "([Status] <> 'Cancelled') OR ([CancelledAt] IS NOT NULL AND [CancelledByAdminId] IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_AiOrderImports_ProcessingLease",
                "([Status] <> 'Processing') OR ([ActiveProcessingLeaseToken] IS NOT NULL AND [ActiveProcessingLeaseExpiresAt] IS NOT NULL)");
        });

        builder.Property(x => x.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.ContractVersion).HasMaxLength(32).IsRequired();
        builder.Property(x => x.IdempotencyKey).HasMaxLength(128).IsRequired();
        builder.Property(x => x.RequestHash).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(x => x.ActiveProcessingLeaseToken).HasMaxLength(64);
        builder.Property(x => x.ConfirmedCanonicalSha256).HasMaxLength(64).IsFixedLength();
        builder.Property(x => x.ConfirmedReviewVersion).HasMaxLength(32);
        builder.Property(x => x.ConfirmationOperationKey).HasMaxLength(128);
        builder.Property(x => x.MaterializationOperationKey).HasMaxLength(128);
        builder.Property(x => x.MaterializationRequestHash).HasMaxLength(64).IsFixedLength();
        builder.Property(x => x.RetentionClass).HasMaxLength(64).IsRequired();
        builder.Property(x => x.RetentionHoldReason).HasMaxLength(500);

        builder.HasIndex(x => new { x.CreatedByAdminId, x.IdempotencyKey })
            .IsUnique()
            .HasDatabaseName("UX_AiOrderImports_Admin_IdempotencyKey");
        builder.HasIndex(x => x.ActiveProcessingLeaseToken)
            .IsUnique()
            .HasFilter("[ActiveProcessingLeaseToken] IS NOT NULL")
            .HasDatabaseName("UX_AiOrderImports_ActiveLeaseToken");
        builder.HasIndex(x => x.FormalOrderId)
            .IsUnique()
            .HasFilter("[FormalOrderId] IS NOT NULL")
            .HasDatabaseName("UX_AiOrderImports_FormalOrderId");
        builder.HasIndex(x => x.ConfirmationOperationKey)
            .IsUnique()
            .HasFilter("[ConfirmationOperationKey] IS NOT NULL")
            .HasDatabaseName("UX_AiOrderImports_ConfirmationOperationKey");
        builder.HasIndex(x => x.MaterializationOperationKey)
            .IsUnique()
            .HasFilter("[MaterializationOperationKey] IS NOT NULL")
            .HasDatabaseName("UX_AiOrderImports_MaterializationOperationKey");
        builder.HasIndex(x => new { x.Status, x.NextRetryAt });
        builder.HasIndex(x => x.CreationTime);
        builder.HasIndex(x => x.RetentionUntil);
    }

    public void Configure(EntityTypeBuilder<AiOrderSourceDocument> builder)
    {
        builder.ToTable("AiOrderSourceDocuments", table =>
        {
            table.HasCheckConstraint("CK_AiOrderSourceDocuments_Sequence", "[Sequence] > 0");
            table.HasCheckConstraint("CK_AiOrderSourceDocuments_ByteSize", "[ByteSize] >= 0");
            table.HasCheckConstraint(
                "CK_AiOrderSourceDocuments_PageCount",
                "[PageCount] IS NULL OR [PageCount] > 0");
            table.HasCheckConstraint(
                "CK_AiOrderSourceDocuments_ImageDimensions",
                "([ImageWidth] IS NULL AND [ImageHeight] IS NULL) OR ([ImageWidth] > 0 AND [ImageHeight] > 0)");
            table.HasCheckConstraint(
                "CK_AiOrderSourceDocuments_Rotation",
                "[RotationDegrees] IN (0, 90, 180, 270)");
        });

        builder.Property(x => x.CaptureMethod)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.PrivateObjectKey).HasMaxLength(160).IsRequired();
        builder.Property(x => x.ContentType).HasMaxLength(128).IsRequired();
        builder.Property(x => x.Sha256).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(x => x.OriginalFileName).HasMaxLength(512);
        builder.Property(x => x.DeletionOutcome)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.SafeDeletionErrorCode).HasMaxLength(128);
        builder.Property(x => x.DeletionFailureCount).HasDefaultValue(0);
        builder.Property(x => x.UploadIdempotencyKey).HasMaxLength(128);
        builder.Property(x => x.QualityWarningsJson).HasColumnType("nvarchar(max)");

        builder.HasOne<AiOrderImport>()
            .WithMany()
            .HasForeignKey(x => x.ImportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.ImportId, x.Sequence })
            .IsUnique()
            .HasFilter("[ContentDeletedAt] IS NULL");
        builder.HasIndex(x => new { x.ImportId, x.UploadIdempotencyKey })
            .IsUnique()
            .HasFilter("[UploadIdempotencyKey] IS NOT NULL")
            .HasDatabaseName("UX_AiOrderSourceDocuments_Import_UploadKey");
        builder.HasIndex(x => x.PrivateObjectKey).IsUnique();
        builder.HasIndex(x => x.Sha256);
        builder.HasIndex(x => x.RetentionUntil);
        builder.HasIndex(x => x.ContentDeletedAt);
        builder.HasIndex(x => new { x.DeletionOutcome, x.DeletionNextRetryAt });
    }

    public void Configure(EntityTypeBuilder<AiOrderProcessingAttempt> builder)
    {
        builder.ToTable("AiOrderProcessingAttempts", table =>
        {
            table.HasCheckConstraint("CK_AiOrderProcessingAttempts_AttemptNumber", "[AttemptNumber] > 0");
            table.HasCheckConstraint(
                "CK_AiOrderProcessingAttempts_TokenCounts",
                "([InputTokenCount] IS NULL OR [InputTokenCount] >= 0) AND ([OutputTokenCount] IS NULL OR [OutputTokenCount] >= 0) AND ([CachedInputTokenCount] IS NULL OR [CachedInputTokenCount] >= 0)");
            table.HasCheckConstraint(
                "CK_AiOrderProcessingAttempts_Costs",
                "([EstimatedCostUsd] IS NULL OR [EstimatedCostUsd] >= 0) AND ([ActualCostUsd] IS NULL OR [ActualCostUsd] >= 0)");
        });

        builder.Property(x => x.LeaseToken).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Provider).HasMaxLength(64);
        builder.Property(x => x.Model).HasMaxLength(128);
        builder.Property(x => x.ProviderRequestId).HasMaxLength(256);
        builder.Property(x => x.Outcome)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.SafeErrorCode).HasMaxLength(128);
        builder.Property(x => x.RawResultObjectKey).HasMaxLength(160);
        builder.Property(x => x.RawResultSha256).HasMaxLength(64).IsFixedLength();
        builder.Property(x => x.ApiMode).HasMaxLength(64);
        builder.Property(x => x.ApiVersion).HasMaxLength(32);
        builder.Property(x => x.PromptVersion).HasMaxLength(64);
        builder.Property(x => x.ContractVersion).HasMaxLength(32);
        builder.Property(x => x.StructuredOutputMode).HasMaxLength(64);
        builder.Property(x => x.PricingVersion).HasMaxLength(64);
        builder.Property(x => x.PricingSnapshotJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.SourceSnapshotJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.StartOperationKey).HasMaxLength(128);
        builder.Property(x => x.StartRequestHash).HasMaxLength(64).IsFixedLength();
        builder.Property(x => x.FinishReason).HasMaxLength(128);
        builder.Property(x => x.EstimatedCostUsd).HasPrecision(18, 6);
        builder.Property(x => x.ActualCostUsd).HasPrecision(18, 6);
        builder.Property(x => x.WorkerClaimToken)
            .HasMaxLength(64)
            .IsConcurrencyToken();
        builder.Property(x => x.RawResultDeletionSafeErrorCode).HasMaxLength(128);
        builder.Property(x => x.RawResultDeletionFailureCount).HasDefaultValue(0);

        builder.HasOne<AiOrderImport>()
            .WithMany()
            .HasForeignKey(x => x.ImportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.ImportId, x.AttemptNumber }).IsUnique();
        builder.HasIndex(x => x.ImportId)
            .IsUnique()
            .HasFilter("[Outcome] = 'Processing'")
            .HasDatabaseName("UX_AiOrderProcessingAttempts_ActiveImport");
        builder.HasIndex(x => x.LeaseToken).IsUnique();
        builder.HasIndex(x => x.ProviderRequestId);
        builder.HasIndex(x => x.NextRetryAt);
        builder.HasIndex(x => new { x.ImportId, x.StartOperationKey })
            .IsUnique()
            .HasFilter("[StartOperationKey] IS NOT NULL")
            .HasDatabaseName("UX_AiOrderProcessingAttempts_Import_StartKey");
        builder.HasIndex(x => new { x.Outcome, x.WorkerClaimExpiresAt });
        builder.HasIndex(x => new { x.RawResultRetentionUntil, x.RawResultDeletedAt });
        builder.HasIndex(x => new { x.RawResultDeletionNextRetryAt, x.RawResultDeletedAt });
    }

    public void Configure(EntityTypeBuilder<AiOrderImportRevision> builder)
    {
        builder.ToTable("AiOrderImportRevisions", table =>
            table.HasCheckConstraint("CK_AiOrderImportRevisions_Revision", "[Revision] > 0"));

        builder.Property(x => x.ContractVersion).HasMaxLength(32).IsRequired();
        builder.Property(x => x.ValidationVersion).HasMaxLength(32).IsRequired();
        builder.Property(x => x.CanonicalJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.Property(x => x.CanonicalSha256).HasMaxLength(64).IsFixedLength().IsRequired();
        builder.Property(x => x.Source)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.Provider).HasMaxLength(64);
        builder.Property(x => x.Model).HasMaxLength(128);
        builder.Property(x => x.PromptVersion).HasMaxLength(64);
        builder.Property(x => x.StructuredOutputMode).HasMaxLength(64);
        builder.Property(x => x.PricingVersion).HasMaxLength(64);

        builder.HasOne<AiOrderImport>()
            .WithMany()
            .HasForeignKey(x => x.ImportId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AiOrderProcessingAttempt>()
            .WithMany()
            .HasForeignKey(x => x.ProcessingAttemptId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.ImportId, x.Revision }).IsUnique();
        builder.HasIndex(x => x.CanonicalSha256);
        builder.HasIndex(x => x.RecordedAt);
        builder.HasIndex(x => x.ProcessingAttemptId)
            .IsUnique()
            .HasFilter("[ProcessingAttemptId] IS NOT NULL");
    }

    public void Configure(EntityTypeBuilder<AiOrderReviewEvent> builder)
    {
        builder.ToTable("AiOrderReviewEvents", table =>
            table.HasCheckConstraint(
                "CK_AiOrderReviewEvents_Revisions",
                "[ToRevision] > 0 AND ([FromRevision] IS NULL OR ([FromRevision] > 0 AND [FromRevision] <= [ToRevision]))"));

        builder.Property(x => x.Action)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.JsonPointer).HasMaxLength(1024);
        builder.Property(x => x.BeforeJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.AfterJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.Reason).HasMaxLength(1000);

        builder.HasOne<AiOrderImport>()
            .WithMany()
            .HasForeignKey(x => x.ImportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.ImportId, x.ToRevision });
        builder.HasIndex(x => x.RecordedAt);
    }

    public void Configure(EntityTypeBuilder<AiOrderSourceAccessAudit> builder)
    {
        builder.ToTable("AiOrderSourceAccessAudits");
        builder.Property(x => x.AccessType)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();
        builder.Property(x => x.FailureCategory).HasMaxLength(64);
        builder.HasIndex(x => new { x.ImportId, x.AccessedAt });
        builder.HasIndex(x => new { x.SourceDocumentId, x.AccessedAt });
        builder.HasIndex(x => new { x.AdminActorId, x.AccessedAt });
    }

    public void Configure(EntityTypeBuilder<AiOrderOperationalEvent> builder)
    {
        builder.ToTable("AiOrderOperationalEvents");
        builder.Property(x => x.EventType)
            .HasConversion<string>()
            .HasMaxLength(48)
            .IsRequired();
        builder.Property(x => x.ActorType).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Reason).HasMaxLength(500);
        builder.Property(x => x.Outcome).HasMaxLength(32).IsRequired();
        builder.Property(x => x.SafeErrorCode).HasMaxLength(128);

        builder.HasOne<AiOrderImport>()
            .WithMany()
            .HasForeignKey(x => x.ImportId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AiOrderSourceDocument>()
            .WithMany()
            .HasForeignKey(x => x.SourceDocumentId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AiOrderProcessingAttempt>()
            .WithMany()
            .HasForeignKey(x => x.ProcessingAttemptId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.ImportId, x.OccurredAt });
        builder.HasIndex(x => new { x.EventType, x.OccurredAt });
        builder.HasIndex(x => new { x.Outcome, x.OccurredAt });
    }
}
