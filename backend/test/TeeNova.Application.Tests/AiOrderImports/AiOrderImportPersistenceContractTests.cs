using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using TeeNova.EntityFrameworkCore;
using Volo.Abp.Application.Services;

namespace TeeNova.AiOrderImports.Tests;

public class AiOrderImportPersistenceContractTests
{
    [Fact]
    public void Model_has_required_uniqueness_and_preserves_audit_children()
    {
        using var db = CreateDbContext();
        var import = db.Model.FindEntityType(typeof(AiOrderImport))!;
        var source = db.Model.FindEntityType(typeof(AiOrderSourceDocument))!;
        var attempt = db.Model.FindEntityType(typeof(AiOrderProcessingAttempt))!;
        var revision = db.Model.FindEntityType(typeof(AiOrderImportRevision))!;
        var accessAudit = db.Model.FindEntityType(typeof(AiOrderSourceAccessAudit))!;

        Assert.Equal("AiOrderImports", import.GetTableName());
        Assert.Equal("teenova", import.GetSchema());
        AssertUniqueIndex(import, nameof(AiOrderImport.CreatedByAdminId), nameof(AiOrderImport.IdempotencyKey));
        AssertUniqueIndex(import, nameof(AiOrderImport.ActiveProcessingLeaseToken));
        AssertUniqueIndex(import, nameof(AiOrderImport.FormalOrderId));
        AssertUniqueIndex(import, nameof(AiOrderImport.MaterializationOperationKey));
        AssertUniqueIndex(source, nameof(AiOrderSourceDocument.ImportId), nameof(AiOrderSourceDocument.Sequence));
        AssertUniqueIndex(source, nameof(AiOrderSourceDocument.PrivateObjectKey));
        AssertUniqueIndex(
            source,
            nameof(AiOrderSourceDocument.ImportId),
            nameof(AiOrderSourceDocument.UploadIdempotencyKey));
        Assert.Equal(
            "[ContentDeletedAt] IS NULL",
            source.GetIndexes().Single(index =>
                index.Properties.Select(property => property.Name).SequenceEqual(
                    [nameof(AiOrderSourceDocument.ImportId), nameof(AiOrderSourceDocument.Sequence)]))
                .GetFilter());
        Assert.Equal("AiOrderSourceAccessAudits", accessAudit.GetTableName());
        AssertUniqueIndex(attempt, nameof(AiOrderProcessingAttempt.LeaseToken));
        AssertUniqueIndex(attempt, nameof(AiOrderProcessingAttempt.ImportId), nameof(AiOrderProcessingAttempt.AttemptNumber));
        AssertUniqueIndex(
            attempt,
            nameof(AiOrderProcessingAttempt.ImportId),
            nameof(AiOrderProcessingAttempt.StartOperationKey));
        Assert.Contains(
            attempt.GetIndexes(),
            index => index.IsUnique &&
                     index.Properties.Select(x => x.Name).SequenceEqual(
                         [nameof(AiOrderProcessingAttempt.ImportId)]) &&
                     index.GetFilter() == "[Outcome] = 'Processing'");
        AssertUniqueIndex(revision, nameof(AiOrderImportRevision.ImportId), nameof(AiOrderImportRevision.Revision));
        AssertUniqueIndex(revision, nameof(AiOrderImportRevision.ProcessingAttemptId));

        var sourceHashIndex = source.GetIndexes().Single(
            x => x.Properties.Select(p => p.Name).SequenceEqual(
                [nameof(AiOrderSourceDocument.Sha256)]));
        Assert.False(sourceHashIndex.IsUnique);

        foreach (var child in new[] { source, attempt, revision, db.Model.FindEntityType(typeof(AiOrderReviewEvent))! })
        {
            Assert.All(
                child.GetForeignKeys(),
                foreignKey => Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior));
        }
    }

    [Fact]
    public void Foundation_service_is_not_an_auto_exposed_application_service()
    {
        Assert.False(
            typeof(IApplicationService).IsAssignableFrom(
                typeof(AiOrderImportFoundationService)));
        Assert.DoesNotContain(
            "AppService",
            typeof(AiOrderImportFoundationService).Name,
            StringComparison.Ordinal);

        var dependencies = typeof(AiOrderImportFoundationService)
            .GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Single()
            .GetParameters()
            .Select(x => x.ParameterType.FullName ?? string.Empty)
            .ToArray();
        Assert.DoesNotContain(dependencies, x =>
            x.Contains("OrderAppService", StringComparison.Ordinal) ||
            x.Contains("Payment", StringComparison.Ordinal) ||
            x.Contains("Catalog", StringComparison.Ordinal) ||
            x.Contains("Inventory", StringComparison.Ordinal) ||
            x.Contains("Email", StringComparison.Ordinal) ||
            x.Contains("Production", StringComparison.Ordinal) ||
            x.Contains("FileStorageService", StringComparison.Ordinal));
    }

    [Fact]
    public void Migration_only_creates_and_drops_new_ai_import_tables()
    {
        var backendRoot = FindBackendRoot();
        var migrationDirectory = Path.Combine(
            backendRoot,
            "src",
            "TeeNova.EntityFrameworkCore",
            "Migrations");
        var migrationPath = Directory
            .GetFiles(migrationDirectory, "*_AddAiOrderImportPersistence.cs")
            .Single();
        var source = File.ReadAllText(migrationPath);

        foreach (var table in new[]
                 {
                     "AiOrderImports",
                     "AiOrderSourceDocuments",
                     "AiOrderProcessingAttempts",
                     "AiOrderImportRevisions",
                     "AiOrderReviewEvents",
                 })
        {
            Assert.Contains($"name: \"{table}\"", source, StringComparison.Ordinal);
        }

        Assert.DoesNotContain("AlterColumn", source, StringComparison.Ordinal);
        Assert.DoesNotContain("AddColumn", source, StringComparison.Ordinal);
        Assert.DoesNotContain("DropColumn", source, StringComparison.Ordinal);
        Assert.DoesNotContain("migrationBuilder.Sql", source, StringComparison.Ordinal);
        Assert.DoesNotContain("Orders\"", source, StringComparison.Ordinal);
        Assert.DoesNotContain("Products\"", source, StringComparison.Ordinal);
        Assert.DoesNotContain("PaymentTransactions\"", source, StringComparison.Ordinal);
    }

    [Fact]
    public void Intake_migration_is_narrow_and_does_not_touch_business_tables()
    {
        var migrationDirectory = Path.Combine(
            FindBackendRoot(),
            "src",
            "TeeNova.EntityFrameworkCore",
            "Migrations");
        var migrationPath = Directory
            .GetFiles(migrationDirectory, "*_AddAiOrderImportIntakeMetadata.cs")
            .Single();
        var source = File.ReadAllText(migrationPath);

        Assert.Contains("AiOrderSourceAccessAudits", source, StringComparison.Ordinal);
        Assert.Contains("AiOrderSourceDocuments", source, StringComparison.Ordinal);
        Assert.Contains("CK_AiOrderSourceDocuments_ImageDimensions", source, StringComparison.Ordinal);
        Assert.Contains("CK_AiOrderSourceDocuments_Rotation", source, StringComparison.Ordinal);
        foreach (var forbidden in new[]
                 {
                     "Orders\"", "OrderItems\"", "Products\"", "PaymentTransactions\"",
                     "Inventory", "Email", "Production",
                 })
        {
            Assert.DoesNotContain(forbidden, source, StringComparison.Ordinal);
        }
    }

    private static TeeNovaDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<TeeNovaDbContext>()
            .UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=ModelOnly;Trusted_Connection=True")
            .Options;
        return new TeeNovaDbContext(options);
    }

    private static void AssertUniqueIndex(
        IEntityType entityType,
        params string[] propertyNames)
    {
        Assert.Contains(
            entityType.GetIndexes(),
            index => index.IsUnique &&
                     index.Properties.Select(x => x.Name).SequenceEqual(propertyNames));
    }

    private static string FindBackendRoot()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "TeeNova.sln")))
                return current.FullName;
            current = current.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate backend/TeeNova.sln.");
    }
}
