namespace TeeNova.AiOrderImports;

public interface IAiOrderMigrationReadinessProbe
{
    Task<AiOrderMigrationReadinessResult> CheckAsync(
        CancellationToken cancellationToken = default);
}

public sealed record AiOrderMigrationReadinessResult(
    IReadOnlyList<string> ExpectedMigrationIds,
    IReadOnlyList<string> AppliedExpectedMigrationIds,
    bool RuntimeSchemaCurrent,
    string Status);
