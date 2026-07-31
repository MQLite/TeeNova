using Microsoft.EntityFrameworkCore;
using global::TeeNova.AiOrderImports;
using Volo.Abp.DependencyInjection;

namespace TeeNova.EntityFrameworkCore.AiOrderImports;

public sealed class AiOrderMigrationReadinessProbe :
    IAiOrderMigrationReadinessProbe,
    ITransientDependency
{
    public static readonly string[] ExpectedMigrationIds =
    [
        "20260730044705_AddAiOrderImportPersistence",
        "20260730055530_AddAiOrderImportIntakeMetadata",
        "20260730225513_AddAiOrderRecognitionEvidence",
        "20260731032528_AddAiOrderConfirmationMaterialization",
        "20260731042341_AddAiOrderOperationsHardening",
    ];

    private readonly TeeNovaDbContext _dbContext;

    public AiOrderMigrationReadinessProbe(TeeNovaDbContext dbContext) => _dbContext = dbContext;

    public async Task<AiOrderMigrationReadinessResult> CheckAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            var applied = (await _dbContext.Database.GetAppliedMigrationsAsync(cancellationToken))
                .ToHashSet(StringComparer.Ordinal);
            var appliedExpected = ExpectedMigrationIds.Where(applied.Contains).ToArray();
            var current = appliedExpected.Length == ExpectedMigrationIds.Length;
            return new(
                ExpectedMigrationIds,
                appliedExpected,
                current,
                current ? "Ready" : "Blocked");
        }
        catch
        {
            return new(ExpectedMigrationIds, [], false, "Blocked");
        }
    }
}
