using System;
using Volo.Abp;

namespace TeeNova.AiOrderImports;

public static class AiOrderImportIdempotencyPolicy
{
    public static AiOrderImport ReturnExistingOrThrow(
        AiOrderImport existing,
        string normalizedRequestHash)
    {
        ArgumentNullException.ThrowIfNull(existing);

        if (!string.Equals(
                existing.RequestHash,
                normalizedRequestHash,
                StringComparison.Ordinal))
        {
            throw new BusinessException("TeeNova:AiOrderImport:IdempotencyHashConflict");
        }

        return existing;
    }
}
