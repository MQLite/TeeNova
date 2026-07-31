using System;
using System.Security.Cryptography;
using System.Text;
using System.Reflection;
using TeeNova.AiOrderImports;
using Volo.Abp;

namespace TeeNova.AiOrderImports.Tests;

public class AiOrderImportDomainTests
{
    private static readonly Guid AdminId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly DateTime Now = new(2026, 7, 30, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Happy_path_requires_reviewed_revision_before_confirmation()
    {
        var import = CreateImport();

        import.ClaimProcessingLease("lease-one", Now.AddMinutes(5), Now);
        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease-one", Now.AddMinutes(1));
        import.MarkDraft();
        import.Confirm(AdminId, 1, Now.AddMinutes(2));

        Assert.Equal(AiOrderImportStatus.Confirmed, import.Status);
        Assert.Equal(1, import.CurrentRevision);
        Assert.Equal(AdminId, import.ConfirmedByAdminId);
        Assert.Null(import.ActiveProcessingLeaseToken);
        Assert.Throws<BusinessException>(() => import.Cancel(AdminId, Now.AddMinutes(3)));
        Assert.Throws<BusinessException>(() => import.AdvanceRevision(1, 2));
    }

    [Fact]
    public void Invalid_transitions_are_rejected()
    {
        var import = CreateImport();

        Assert.Throws<BusinessException>(() => import.MarkDraft());
        Assert.Throws<BusinessException>(() => import.Confirm(AdminId, 0, Now));
        Assert.Throws<BusinessException>(() => import.CompleteProcessing("not-owned", Now));
    }

    [Fact]
    public void Failure_can_be_retried_with_a_new_lease()
    {
        var import = CreateImport();

        import.ClaimProcessingLease("lease-one", Now.AddMinutes(5), Now);
        import.FailProcessing(
            "lease-one",
            retryable: true,
            Now.AddMinutes(10),
            Now.AddMinutes(1));

        Assert.Equal(AiOrderImportStatus.Failed, import.Status);
        Assert.Equal(Now.AddMinutes(10), import.NextRetryAt);

        import.ClaimProcessingLease("lease-two", Now.AddMinutes(20), Now.AddMinutes(10));

        Assert.Equal(AiOrderImportStatus.Processing, import.Status);
        Assert.Equal("lease-two", import.ActiveProcessingLeaseToken);
        Assert.Null(import.NextRetryAt);
    }

    [Fact]
    public void Successful_processing_requires_a_persistable_revision()
    {
        var import = CreateImport();
        import.ClaimProcessingLease("lease-one", Now.AddMinutes(5), Now);

        Assert.Throws<BusinessException>(() =>
            import.CompleteProcessing("lease-one", Now.AddMinutes(1)));

        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease-one", Now.AddMinutes(1));
        Assert.Equal(AiOrderImportStatus.NeedsReview, import.Status);
    }

    [Fact]
    public void Expired_or_replaced_lease_cannot_complete_late()
    {
        var import = CreateImport();

        import.ClaimProcessingLease("lease-one", Now.AddMinutes(1), Now);
        import.ClaimProcessingLease("lease-two", Now.AddMinutes(4), Now.AddMinutes(2));

        Assert.Throws<BusinessException>(() =>
            import.CompleteProcessing("lease-one", Now.AddMinutes(3)));

        import.AdvanceRevision(0, 1);
        import.CompleteProcessing("lease-two", Now.AddMinutes(3));
        Assert.Equal(AiOrderImportStatus.NeedsReview, import.Status);
    }

    [Fact]
    public void Cancellation_revokes_lease_and_blocks_late_result()
    {
        var import = CreateImport();
        import.ClaimProcessingLease("lease-one", Now.AddMinutes(5), Now);

        import.Cancel(AdminId, Now.AddMinutes(1));

        Assert.Equal(AiOrderImportStatus.Cancelled, import.Status);
        Assert.Null(import.ActiveProcessingLeaseToken);
        Assert.Throws<BusinessException>(() =>
            import.CompleteProcessing("lease-one", Now.AddMinutes(2)));
    }

    [Fact]
    public void Revision_numbers_are_compare_and_set_and_strictly_sequential()
    {
        var import = CreateImport();

        import.AdvanceRevision(0, 1);

        Assert.Throws<BusinessException>(() => import.AdvanceRevision(0, 1));
        Assert.Throws<BusinessException>(() => import.AdvanceRevision(1, 3));
        import.AdvanceRevision(1, 2);

        Assert.Equal(2, import.CurrentRevision);
    }

    [Fact]
    public void Idempotency_policy_returns_same_import_for_same_hash()
    {
        var import = CreateImport();

        var result = AiOrderImportIdempotencyPolicy.ReturnExistingOrThrow(
            import,
            new string('a', 64));

        Assert.Same(import, result);
    }

    [Fact]
    public void Idempotency_policy_rejects_same_key_with_different_hash()
    {
        var import = CreateImport();

        Assert.Throws<BusinessException>(() =>
            AiOrderImportIdempotencyPolicy.ReturnExistingOrThrow(
                import,
                new string('b', 64)));
    }

    [Fact]
    public void Source_hash_is_metadata_and_does_not_identify_an_import()
    {
        var hash = new string('c', 64);
        var first = new AiOrderSourceDocument(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            AiOrderCaptureMethod.Upload,
            $"source-documents/{Guid.NewGuid():N}",
            "image/png",
            10,
            null,
            hash,
            "one.png",
            AdminId,
            Now,
            null);
        var second = new AiOrderSourceDocument(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            AiOrderCaptureMethod.Camera,
            $"source-documents/{Guid.NewGuid():N}",
            "image/png",
            10,
            null,
            hash,
            "two.png",
            AdminId,
            Now,
            null);

        Assert.Equal(first.Sha256, second.Sha256);
        Assert.NotEqual(first.ImportId, second.ImportId);
    }

    [Fact]
    public void Source_deletion_keeps_metadata_and_is_idempotent()
    {
        var source = new AiOrderSourceDocument(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            AiOrderCaptureMethod.Upload,
            $"source-documents/{Guid.NewGuid():N}",
            "image/png",
            10,
            1,
            new string('d', 64),
            "source.png",
            AdminId,
            Now,
            null);

        source.MarkContentDeleted(Now.AddDays(1));
        source.MarkContentDeleted(Now.AddDays(2));

        Assert.Equal(AiOrderSourceDeletionOutcome.Deleted, source.DeletionOutcome);
        Assert.Equal(Now.AddDays(1), source.ContentDeletedAt);
        Assert.Equal(new string('d', 64), source.Sha256);
    }

    [Fact]
    public void Source_rotation_is_non_destructive_and_rejects_invalid_values()
    {
        var source = CreateSource();
        var hash = source.Sha256;
        var key = source.PrivateObjectKey;

        source.SetRotation(90);

        Assert.Equal(90, source.RotationDegrees);
        Assert.Equal(hash, source.Sha256);
        Assert.Equal(key, source.PrivateObjectKey);
        Assert.Throws<BusinessException>(() => source.SetRotation(45));
    }

    [Fact]
    public void Deleted_source_rejects_rotation_and_reordering()
    {
        var source = CreateSource();
        source.MarkContentDeleted(Now);

        Assert.Throws<BusinessException>(() => source.SetRotation(180));
        Assert.Throws<BusinessException>(() => source.ChangeSequence(2));
    }

    [Fact]
    public void Revision_rejects_canonical_hash_mismatch()
    {
        Assert.Throws<BusinessException>(() =>
            new AiOrderImportRevision(
                Guid.NewGuid(),
                Guid.NewGuid(),
                1,
                "1.0",
                "1.0",
                "{}",
                new string('0', 64),
                AiOrderRevisionSource.AI,
                AdminId,
                Now));
    }

    [Fact]
    public void Revision_accepts_hash_of_exact_canonical_bytes()
    {
        const string json = "{\"contractVersion\":\"1.0\"}";
        var hash = Convert
            .ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)))
            .ToLowerInvariant();

        var revision = new AiOrderImportRevision(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            "1.0",
            "1.0",
            json,
            hash,
            AiOrderRevisionSource.AI,
            AdminId,
            Now);

        Assert.Equal(hash, revision.CanonicalSha256);
        Assert.Equal(json, revision.CanonicalJson);
    }

    [Fact]
    public void Revision_payload_has_no_public_mutators()
    {
        var mutablePayloadProperty = typeof(AiOrderImportRevision)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .FirstOrDefault(property => property.SetMethod?.IsPublic == true);

        Assert.Null(mutablePayloadProperty);
    }

    private static AiOrderImport CreateImport() =>
        new(
            Guid.NewGuid(),
            AdminId,
            "1.0",
            "test-idempotency-key",
            new string('a', 64),
            "standard");

    private static AiOrderSourceDocument CreateSource() =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            AiOrderCaptureMethod.Camera,
            $"source-documents/{Guid.NewGuid():N}",
            "image/jpeg",
            10,
            null,
            new string('e', 64),
            "source.jpg",
            AdminId,
            Now,
            null,
            "upload-key",
            100,
            100);
}
