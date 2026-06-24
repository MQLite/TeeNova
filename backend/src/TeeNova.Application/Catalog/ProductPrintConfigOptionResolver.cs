using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Catalog;

/// <summary>
/// Resolves and validates product/size scoped allowed print options (Jira 9204). Shared by the quote
/// path (<c>PricingAppService</c>) and the authoritative order path (<c>OrderAppService.CreateAsync</c>)
/// so display filtering and saved orders apply the same rule.
///
/// Resolution (active rows only): size-override rows win for the garment size; else product-default
/// rows; else <c>null</c> meaning "no scoped restriction — fall back to the global PrintAreaSizeOption
/// matrix". Scoped rows only <b>narrow</b> choices; global validity (active PrintArea/PrintSize and an
/// active global PrintAreaSizeOption) is still enforced separately by <see cref="PrintConfig.PrintConfigValidator"/>.
/// </summary>
public class ProductPrintConfigOptionResolver : ITransientDependency
{
    private readonly IRepository<ProductPrintConfigOption, Guid> _optionRepository;

    public ProductPrintConfigOptionResolver(IRepository<ProductPrintConfigOption, Guid> optionRepository)
    {
        _optionRepository = optionRepository;
    }

    /// <summary>
    /// Returns the effective scoped allowed (PrintAreaId, PrintSizeId) set for a product + garment size,
    /// or <c>null</c> when the product has no scoped rows for that size or its default (caller then
    /// uses the global matrix). Only active rows are considered.
    /// </summary>
    public async Task<HashSet<(Guid AreaId, Guid SizeId)>?> ResolveAllowedPairsAsync(Guid productId, string? garmentSize)
    {
        var activeRows = await _optionRepository.GetListAsync(o => o.ProductId == productId && o.IsActive);
        return ResolveAllowedPairs(activeRows, garmentSize);
    }

    /// <summary>Pure resolution over an already-loaded set of <b>active</b> scoped rows.</summary>
    public static HashSet<(Guid AreaId, Guid SizeId)>? ResolveAllowedPairs(
        IReadOnlyList<ProductPrintConfigOption> activeRows, string? garmentSize)
    {
        if (activeRows.Count == 0)
            return null;

        var scoped = !string.IsNullOrEmpty(garmentSize)
            ? activeRows.Where(o => string.Equals(o.Size, garmentSize, StringComparison.Ordinal)).ToList()
            : new List<ProductPrintConfigOption>();

        if (scoped.Count == 0)
            scoped = activeRows.Where(o => o.Size == null).ToList();

        if (scoped.Count == 0)
            return null; // no default and no override for this size → global fallback

        return scoped.Select(o => (o.PrintAreaId, o.PrintSizeId)).ToHashSet();
    }

    /// <summary>
    /// Throws a friendly <see cref="BusinessException"/> for any selected (PrintArea, PrintSize) pair
    /// not permitted by the product's scoped options. No-op when the product has no scoped restriction
    /// for this size (the global validator then governs) or when nothing is selected. Global
    /// active-state checks are performed by the caller / PrintConfigValidator, not here.
    /// </summary>
    public async Task ValidateSelectionAsync(
        Guid productId, string? garmentSize, IReadOnlyList<(Guid AreaId, Guid SizeId)> selectedPairs)
    {
        if (selectedPairs.Count == 0)
            return;

        var allowed = await ResolveAllowedPairsAsync(productId, garmentSize);
        if (allowed == null)
            return; // unconfigured for this size → preserve existing global behaviour

        foreach (var (areaId, sizeId) in selectedPairs)
        {
            if (!allowed.Contains((areaId, sizeId)))
                throw new BusinessException("TeeNova:PrintConfig:PrintOptionNotAllowedForProduct")
                    .WithData("ProductId", productId)
                    .WithData("Size", string.IsNullOrEmpty(garmentSize) ? "(default)" : garmentSize)
                    .WithData("PrintAreaId", areaId)
                    .WithData("PrintSizeId", sizeId);
        }
    }
}
