using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Catalog;
using TeeNova.Pricing;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Orders;

/// <summary>
/// Shared, authoritative whole-order pricing orchestration (Jira 9405, extended for multi-model pricing
/// in Jira 9503). Used by order creation, the admin content-edit quote, and the admin content-edit save
/// so every path resolves prices through ONE code path and cannot drift (Epic 9200: backend pricing is
/// authoritative; client prices are never trusted).
///
/// It accepts a draft (product/variant ids, quantities, print/design selections — NO prices), loads the
/// referenced products once, computes garment <see cref="PrintPricingGroup"/> totals for the GarmentPrint
/// items only, then dispatches each item to the matching <see cref="IItemPricingStrategy"/> by the
/// product's <see cref="Product.PricingModel"/>. Pure pricing only — no persistence; callers map the
/// returned <see cref="PricedOrderDraft"/> onto <see cref="OrderItem"/>s.
/// </summary>
public class OrderContentPricingService : ITransientDependency
{
    private readonly IRepository<Catalog.Product, Guid>               _productRepository;
    private readonly IRepository<Catalog.PrintPricingGroup, Guid>     _printPricingGroupRepository;
    private readonly IRepository<Catalog.ProductPrintPriceTier, Guid> _printPriceTierRepository;
    private readonly IReadOnlyDictionary<PricingModel, IItemPricingStrategy> _strategies;
    private readonly ILogger<OrderContentPricingService>              _logger;

    public OrderContentPricingService(
        IRepository<Catalog.Product, Guid>               productRepository,
        IRepository<Catalog.PrintPricingGroup, Guid>     printPricingGroupRepository,
        IRepository<Catalog.ProductPrintPriceTier, Guid> printPriceTierRepository,
        IEnumerable<IItemPricingStrategy>                strategies,
        ILogger<OrderContentPricingService>              logger)
    {
        _productRepository           = productRepository;
        _printPricingGroupRepository = printPricingGroupRepository;
        _printPriceTierRepository    = printPriceTierRepository;
        _strategies                  = BuildStrategyMap(strategies);
        _logger                      = logger;
    }

    private static IReadOnlyDictionary<PricingModel, IItemPricingStrategy> BuildStrategyMap(
        IEnumerable<IItemPricingStrategy> strategies)
    {
        var map = new Dictionary<PricingModel, IItemPricingStrategy>();
        foreach (var strategy in strategies)
            map[strategy.Model] = strategy; // last registration wins; one per model expected
        return map;
    }

    /// <summary>
    /// Prices a whole-order draft. Throws <see cref="EntityNotFoundException"/> /
    /// <see cref="BusinessException"/> on invalid product/variant/print/quantity selections.
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

        // Garment print-tier quantity scope (Jira 9203): the PrintPricingGroup TOTAL quantity across the
        // WHOLE draft, counting GARMENT-PRINT items only (Jira 9503: Badge/non-garment never aggregate).
        var groupQuantities = new Dictionary<string, int>();
        foreach (var item in items)
        {
            var product = products[item.ProductId];
            if (product.PricingModel != PricingModel.GarmentPrint)
                continue;
            var key = PrintPricingGroupKey(product);
            groupQuantities[key] = groupQuantities.GetValueOrDefault(key) + item.Quantity;
        }

        // Load all tiers for the real (active) groups referenced by GarmentPrint products in this draft.
        var groupIds = products.Values
            .Where(p => p.PricingModel == PricingModel.GarmentPrint && p.PrintPricingGroupId.HasValue)
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
            var product  = products[item.ProductId];
            var strategy = ResolveStrategy(product);

            var isGarment = product.PricingModel == PricingModel.GarmentPrint;
            var groupTiers = isGarment
                && product.PrintPricingGroupId.HasValue
                && tiersByGroup.TryGetValue(product.PrintPricingGroupId.Value, out var gt)
                    ? gt
                    : null;
            var groupQuantity = isGarment ? groupQuantities[PrintPricingGroupKey(product)] : 0;

            var priced = await strategy.PriceItemAsync(new ItemPricingContext
            {
                Product              = product,
                Item                 = item,
                GarmentGroupQuantity = groupQuantity,
                GarmentGroupTiers    = groupTiers,
            });

            pricedItems.Add(priced);

            _logger.LogInformation(
                "[OrderContentPricing] ProductId={ProductId} PricingModel={PricingModel} Quantity={Quantity} PrintCount={PrintCount} UnitPrice={UnitPrice} LineTotal={LineTotal}",
                product.Id,
                product.PricingModel,
                item.Quantity,
                priced.Prints.Count,
                priced.UnitPrice,
                priced.UnitPrice * item.Quantity);
        }

        return new PricedOrderDraft(pricedItems);
    }

    private IItemPricingStrategy ResolveStrategy(Catalog.Product product)
    {
        if (_strategies.TryGetValue(product.PricingModel, out var strategy))
            return strategy;

        throw new BusinessException("TeeNova:Pricing:UnsupportedPricingModel")
            .WithData("ProductId", product.Id)
            .WithData("PricingModel", product.PricingModel);
    }

    /// <summary>
    /// Print-tier aggregation key (Jira 9203): the PrintPricingGroup id when grouped, otherwise an
    /// isolated per-product key so ungrouped products never aggregate with others.
    /// </summary>
    private static string PrintPricingGroupKey(Catalog.Product product)
        => product.PrintPricingGroupId.HasValue
            ? $"g:{product.PrintPricingGroupId.Value}"
            : $"p:{product.Id}";
}

// ── Draft input (IDs + quantities + design/notes only — never prices) ───────────────────────────────

/// <summary>A whole-order draft item to be priced. <see cref="Id"/> identifies an existing OrderItem
/// (edit) or is null (new). Carries NO price fields. <see cref="ProductVariantId"/> is null for
/// non-garment items (Badge); item-level design fields are used by non-garment items (Jira 9503).</summary>
public sealed record OrderDraftItem(
    Guid? Id,
    Guid ProductId,
    Guid? ProductVariantId,
    int Quantity,
    IReadOnlyList<OrderDraftPrint> Prints,
    Guid? UploadedAssetId = null,
    string? UploadedAssetUrl = null,
    string? DesignNote = null,
    string? ConfigurationJson = null);

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
    Guid? ProductVariantId,
    string? VariantLabel,
    int Quantity,
    decimal UnitPrice,
    IReadOnlyList<PricedOrderPrint> Prints,
    PricingModel PricingModel,
    ProductKind ProductKind,
    Guid? UploadedAssetId = null,
    string? UploadedAssetUrl = null,
    string? DesignNote = null,
    int? AppliedQuantityTierMinQuantity = null,
    string? ConfigurationJson = null);

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
