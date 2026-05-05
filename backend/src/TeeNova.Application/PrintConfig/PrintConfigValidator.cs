using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.PrintConfig;

/// <summary>
/// Validates that a set of (PrintArea, PrintSize) pairs are all covered by an active
/// PrintAreaSizeOption. Uses a single batch query for all pairs.
/// </summary>
public class PrintConfigValidator : ITransientDependency
{
    private readonly IRepository<PrintAreaSizeOption, Guid> _optionRepository;

    public PrintConfigValidator(IRepository<PrintAreaSizeOption, Guid> optionRepository)
    {
        _optionRepository = optionRepository;
    }

    /// <summary>
    /// Throws <see cref="BusinessException"/> for any pair that has no active
    /// PrintAreaSizeOption row. Call this after individual PrintArea/PrintSize
    /// existence and active-status checks have already passed.
    /// </summary>
    public async Task ValidatePrintCombinationsAsync(
        IReadOnlyList<(PrintArea Area, PrintSize Size)> pairs)
    {
        if (pairs == null || pairs.Count == 0)
            return;

        var areaIds = pairs.Select(p => p.Area.Id).Distinct().ToList();
        var sizeIds = pairs.Select(p => p.Size.Id).Distinct().ToList();

        // Single batch query — fetch only options that could possibly cover any of the pairs.
        var options = await _optionRepository.GetListAsync(
            o => areaIds.Contains(o.PrintAreaId) && sizeIds.Contains(o.PrintSizeId));

        // Build an exact-pair lookup so we never treat (AreaX, SizeB) as valid just because
        // AreaX has some option with SizeA and SizeB has some option with AreaY.
        var activeOptionSet = options
            .Where(o => o.IsActive)
            .Select(o => (o.PrintAreaId, o.PrintSizeId))
            .ToHashSet();

        foreach (var (area, size) in pairs)
        {
            if (!activeOptionSet.Contains((area.Id, size.Id)))
                throw new BusinessException("TeeNova:PrintConfig:InvalidPrintAreaSizeOption")
                    .WithData("PrintAreaId",   area.Id)
                    .WithData("PrintAreaName", area.Name)
                    .WithData("PrintSizeId",   size.Id)
                    .WithData("PrintSizeName", size.Name);
        }
    }
}
