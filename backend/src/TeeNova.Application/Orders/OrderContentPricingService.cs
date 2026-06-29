using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Pricing;
using TeeNova.PrintConfig;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Orders;

/// <summary>
/// Shared, authoritative whole-order pricing orchestration (Jira 9405). Extracted from
/// <c>OrderAppService.CreateAsync</c> so order creation, the admin content-edit quote, and the
/// admin content-edit save all resolve prices through ONE code path and cannot drift (Epic 9200:
/// backend pricing is authoritative; client prices are never trusted).
///
/// It accepts a draft (product/variant ids, quantities, print selections — NO prices), then:
///  1. Loads every referenced product (with variants) once.
///  2. Computes <see cref="Catalog.PrintPricingGroup"/> TOTAL quantities across the WHOLE draft
///     (group-aware tier coupling — one line's quantity change can reprice other lines).
///  3. Loads the active groups' tiers.
///  4. Validates each variant/print (active area + size, global matrix, product/size scoped options).
///  5. Resolves every print via <see cref="PrintTierPriceResolver"/> and prices each item via
///     <see cref="PriceCalculator"/>, returning fully-snapshotted priced rows.
///
/// Pure pricing only — it performs NO persistence and builds no domain entities; callers map the
/// <see cref="PricedOrderDraft"/> onto new/updated <see cref="OrderItem"/>s.
/// </summary>
public class OrderContentPricingService : ITransientDependency
{
    private readonly IRepository<Catalog.Product, Guid>               _productRepository;
    private readonly IRepository<Catalog.PrintPricingGroup, Guid>     _printPricingGroupRepository;
    private readonly IRepository<Catalog.ProductPrintPriceTier, Guid> _printPriceTierRepository;
    private readonly IRepository<PrintArea, Guid>                     _printAreaRepository;
    private readonly IRepository<PrintSize, Guid>                     _printSizeRepository;
    private readonly PrintConfigValidator                             _printConfigValidator;
    private readonly Catalog.ProductPrintConfigOptionResolver         _printConfigOptionResolver;
    private readonly ILogger<OrderContentPricingService>              _logger;

    public OrderContentPricingService(
        IRepository<Catalog.Product, Guid>               productRepository,
        IRepository<Catalog.PrintPricingGroup, Guid>     printPricingGroupRepository,
        IRepository<Catalog.ProductPrintPriceTier, Guid> printPriceTierRepository,
        IRepository<PrintArea, Guid>                     printAreaRepository,
        IRepository<PrintSize, Guid>                     printSizeRepository,
        PrintConfigValidator                             printConfigValidator,
        Catalog.ProductPrintConfigOptionResolver         printConfigOptionResolver,
        ILogger<OrderContentPricingService>              logger)
    {
        _productRepository           = productRepository;
        _printPricingGroupRepository = printPricingGroupRepository;
        _printPriceTierRepository    = printPriceTierRepository;
        _printAreaRepository         = printAreaRepository;
        _printSizeRepository         = printSizeRepository;
        _printConfigValidator        = printConfigValidator;
        _printConfigOptionResolver   = printConfigOptionResolver;
        _logger                      = logger;
    }

    /// <summary>
    /// Prices a whole-order draft. Throws <see cref="EntityNotFoundException"/> /
    /// <see cref="BusinessException"/> on invalid product/variant/print selections, mirroring the
    /// validation order of <c>CreateAsync</c>.
    /// </summary>
    public async Task<PricedOrderDraft> PriceAsync(IReadOnlyList<OrderDraftItem> items)
    {
        if (items == null || items.Count == 0)
            throw new BusinessException("TeeNova:Order:OrderMustHaveItems");

        // Load every referenced product (with variants) once, up front.
        var productIds = items.Select(i => i.ProductId).Distinct().ToList();
        var productQueryable = await _productRepository.GetQueryableAsync();
        var products = (await productQueryable
                .Include(p => p.Variants)
                .Where(p => productIds.Contains(p.Id))
                .ToListAsync())
            .ToDictionary(p => p.Id);

        foreach (var id in productIds)
            if (!products.ContainsKey(id))
                throw new EntityNotFoundException(typeof(Catalog.Product), id);

        // Print-tier quantity scope (Jira 9203): the PrintPricingGroup TOTAL quantity across the WHOLE
        // draft. Products that share a group combine; ungrouped products are isolated. Each item's
        // garment quantity counts ONCE for the group, regardless of how many prints it carries.
        var groupQuantities = new Dictionary<string, int>();
        foreach (var item in items)
        {
            var key = PrintPricingGroupKey(products[item.ProductId]);
            groupQuantities[key] = groupQuantities.GetValueOrDefault(key) + item.Quantity;
        }

        // Load all tiers for the real (active) groups referenced by this draft, grouped for resolution.
        var groupIds = products.Values
            .Where(p => p.PrintPricingGroupId.HasValue)
            .Select(p => p.PrintPricingGroupId!.Value)
            .Distinct()
            .ToList();

        var activeGroupIds = groupIds.Count == 0
            ? new List<Guid>()
            : (await _printPricingGroupRepository.GetListAsync(g => groupIds.Contains(g.Id) && g.IsActive))
                .Select(g => g.Id)
                .ToList();

        var tiersByGroup = activeGroupIds.Count == 0
            ? new Dictionary<Guid, List<Catalog.ProductPrintPriceTier>>()
            : (await _printPriceTierRepository.GetListAsync(t => activeGroupIds.Contains(t.PrintPricingGroupId)))
                .GroupBy(t => t.PrintPricingGroupId)
                .ToDictionary(g => g.Key, g => g.ToList());

        var pricedItems = new List<PricedOrderItem>();

        foreach (var item in items)
        {
            var product = products[item.ProductId];

            var variant = product.Variants.FirstOrDefault(v => v.Id == item.ProductVariantId)
                ?? throw new BusinessException("TeeNova:Catalog:VariantNotFound");

            // Load + validate prints first (global active-state + matrix), then narrow by the
            // product/size scoped allowed options (Jira 9204); a no-op for unconfigured products.
            var loadedPrints = item.Prints?.Count > 0
                ? await LoadPrintsAsync(item.Prints)
                : new List<LoadedDraftPrint>();

            await _printConfigOptionResolver.ValidateSelectionAsync(
                product.Id,
                variant.Size,
                loadedPrints.Select(p => (p.Area.Id, p.Size.Id)).ToList());

            // Resolve each print against the effective group's tiers + group quantity, then price
            // through the shared PriceCalculator (print-only formula: garment fixed + Σ resolved prints).
            var groupQuantity = groupQuantities[PrintPricingGroupKey(product)];
            var groupTiers = product.PrintPricingGroupId.HasValue
                && tiersByGroup.TryGetValue(product.PrintPricingGroupId.Value, out var gt)
                    ? gt
                    : null;

            var resolvedByPrint = loadedPrints
                .Select(p => PrintTierPriceResolver.Resolve(
                    groupTiers, variant.Size, p.Size.Id, groupQuantity, p.Size.BasePrice))
                .ToList();

            var resolvedPrints = loadedPrints
                .Select((p, idx) => new ResolvedPrintAddOn(
                    new PrintPricingEntry(
                        p.Area.Id, p.Area.Name, p.Area.BasePrice,
                        p.Size.Id, p.Size.Name, p.Size.BasePrice),
                    resolvedByPrint[idx]))
                .ToList();

            var unitPrice = PriceCalculator
                .Calculate(product.BasePrice, variant.PriceAdjustment, resolvedPrints, item.Quantity)
                .UnitPrice;

            var variantLabel = $"{variant.Color} / {variant.Size}";

            var pricedPrints = loadedPrints
                .Select((p, idx) => new PricedOrderPrint(
                    p.Id,
                    p.Area.Id, p.Area.Name, p.Area.Code, p.Area.BasePrice,
                    p.Size.Id, p.Size.Name, p.Size.Code, p.Size.BasePrice,
                    ResolvedUnitPrintPrice: resolvedByPrint[idx].UnitPrintPrice,
                    AppliedPrintTierMinQuantity: resolvedByPrint[idx].AppliedMinQuantity,
                    SortOrder: idx,
                    UploadedAssetId: p.UploadedAssetId,
                    UploadedAssetUrl: p.UploadedAssetUrl,
                    DesignNote: p.DesignNote,
                    PrintNotes: p.PrintNotes))
                .ToList();

            pricedItems.Add(new PricedOrderItem(
                item.Id,
                product.Id, product.Name,
                variant.Id, variantLabel,
                item.Quantity, unitPrice,
                pricedPrints));

            _logger.LogInformation(
                "[OrderContentPricing] ProductId={ProductId} ProductVariantId={ProductVariantId} Quantity={Quantity} GroupQuantity={GroupQuantity} PrintCount={PrintCount} UnitPrice={UnitPrice} LineTotal={LineTotal}",
                product.Id,
                variant.Id,
                item.Quantity,
                groupQuantity,
                loadedPrints.Count,
                unitPrice,
                unitPrice * item.Quantity);
        }

        return new PricedOrderDraft(pricedItems);
    }

    /// <summary>
    /// Loads and validates PrintArea + PrintSize for each requested print (active-state + global matrix),
    /// preserving each draft print's design/note metadata. Mirrors <c>LoadOrderItemPrintsAsync</c>.
    /// </summary>
    private async Task<List<LoadedDraftPrint>> LoadPrintsAsync(IReadOnlyList<OrderDraftPrint> prints)
    {
        var result = new List<LoadedDraftPrint>();
        var pairs  = new List<(PrintArea Area, PrintSize Size)>();

        foreach (var dto in prints)
        {
            var area = await _printAreaRepository.FindAsync(dto.PrintAreaId)
                ?? throw new EntityNotFoundException(typeof(PrintArea), dto.PrintAreaId);

            if (!area.IsActive)
                throw new BusinessException("TeeNova:PrintConfig:PrintAreaInactive")
                    .WithData("PrintAreaId", dto.PrintAreaId)
                    .WithData("PrintAreaName", area.Name);

            var size = await _printSizeRepository.FindAsync(dto.PrintSizeId)
                ?? throw new EntityNotFoundException(typeof(PrintSize), dto.PrintSizeId);

            if (!size.IsActive)
                throw new BusinessException("TeeNova:PrintConfig:PrintSizeInactive")
                    .WithData("PrintSizeId", dto.PrintSizeId)
                    .WithData("PrintSizeName", size.Name);

            pairs.Add((area, size));
            result.Add(new LoadedDraftPrint(
                dto.Id, area, size,
                dto.UploadedAssetId, dto.UploadedAssetUrl, dto.DesignNote, dto.PrintNotes));
        }

        // Validate every (PrintArea, PrintSize) pair against an active PrintAreaSizeOption (batch query).
        await _printConfigValidator.ValidatePrintCombinationsAsync(pairs);

        return result;
    }

    /// <summary>
    /// Print-tier aggregation key (Jira 9203): the PrintPricingGroup id when grouped, otherwise an
    /// isolated per-product key so ungrouped products never aggregate with others.
    /// </summary>
    private static string PrintPricingGroupKey(Catalog.Product product)
        => product.PrintPricingGroupId.HasValue
            ? $"g:{product.PrintPricingGroupId.Value}"
            : $"p:{product.Id}";

    private sealed record LoadedDraftPrint(
        Guid? Id,
        PrintArea Area,
        PrintSize Size,
        Guid? UploadedAssetId,
        string? UploadedAssetUrl,
        string? DesignNote,
        string? PrintNotes);
}

// ── Draft input (IDs + quantities + design/notes only — never prices) ───────────────────────────────

/// <summary>A whole-order draft item to be priced. <see cref="Id"/> identifies an existing OrderItem
/// (edit) or is null (new). Carries NO price fields.</summary>
public sealed record OrderDraftItem(
    Guid? Id,
    Guid ProductId,
    Guid ProductVariantId,
    int Quantity,
    IReadOnlyList<OrderDraftPrint> Prints);

/// <summary>A draft print selection. <see cref="Id"/> identifies an existing OrderItemPrint or is null.</summary>
public sealed record OrderDraftPrint(
    Guid? Id,
    Guid PrintAreaId,
    Guid PrintSizeId,
    Guid? UploadedAssetId,
    string? UploadedAssetUrl,
    string? DesignNote,
    string? PrintNotes);

// ── Priced result (fully-snapshotted; ready to build/update OrderItem + OrderItemPrint) ─────────────

public sealed record PricedOrderDraft(IReadOnlyList<PricedOrderItem> Items)
{
    public decimal TotalAmount => Items.Sum(i => i.UnitPrice * i.Quantity);
}

public sealed record PricedOrderItem(
    Guid? Id,
    Guid ProductId,
    string ProductName,
    Guid ProductVariantId,
    string VariantLabel,
    int Quantity,
    decimal UnitPrice,
    IReadOnlyList<PricedOrderPrint> Prints);

public sealed record PricedOrderPrint(
    Guid? Id,
    Guid PrintAreaId,
    string PrintAreaName,
    string PrintAreaCode,
    decimal PrintAreaPrice,
    Guid PrintSizeId,
    string PrintSizeName,
    string PrintSizeCode,
    decimal PrintSizePrice,
    decimal ResolvedUnitPrintPrice,
    int? AppliedPrintTierMinQuantity,
    int SortOrder,
    Guid? UploadedAssetId,
    string? UploadedAssetUrl,
    string? DesignNote,
    string? PrintNotes);
