using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TeeNova.Catalog;
using TeeNova.Orders;
using TeeNova.PrintConfig;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Pricing;

/// <summary>
/// The existing Epic 9200 garment pricing, extracted unchanged into the strategy seam (Jira 9503):
/// fixed garment price (base + variant adjustment) plus Σ resolved print-tier prices, with group-aware
/// print-tier quantity coupling. Behavior is identical to the pre-9503 per-item block in
/// <see cref="Orders.OrderContentPricingService"/>; only its location moved.
/// </summary>
[ExposeServices(typeof(IItemPricingStrategy))]
public class GarmentPrintPricingStrategy : IItemPricingStrategy, ITransientDependency
{
    private readonly IRepository<PrintArea, Guid>             _printAreaRepository;
    private readonly IRepository<PrintSize, Guid>             _printSizeRepository;
    private readonly PrintConfigValidator                     _printConfigValidator;
    private readonly ProductPrintConfigOptionResolver         _printConfigOptionResolver;

    public GarmentPrintPricingStrategy(
        IRepository<PrintArea, Guid>     printAreaRepository,
        IRepository<PrintSize, Guid>     printSizeRepository,
        PrintConfigValidator             printConfigValidator,
        ProductPrintConfigOptionResolver printConfigOptionResolver)
    {
        _printAreaRepository       = printAreaRepository;
        _printSizeRepository       = printSizeRepository;
        _printConfigValidator      = printConfigValidator;
        _printConfigOptionResolver = printConfigOptionResolver;
    }

    public PricingModel Model => PricingModel.GarmentPrint;

    public async Task<PricedOrderItem> PriceItemAsync(ItemPricingContext context)
    {
        var product = context.Product;
        var item    = context.Item;

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
        var resolvedByPrint = loadedPrints
            .Select(p => PrintTierPriceResolver.Resolve(
                context.GarmentGroupTiers, variant.Size, p.Size.Id, context.GarmentGroupQuantity, p.Size.BasePrice))
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

        return new PricedOrderItem(
            item.Id,
            product.Id, product.Name,
            variant.Id, variantLabel,
            item.Quantity, unitPrice,
            pricedPrints,
            PricingModel.GarmentPrint,
            ProductKind.Garment);
    }

    /// <summary>
    /// Loads and validates PrintArea + PrintSize for each requested print (active-state + global matrix),
    /// preserving each draft print's design/note metadata.
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

    private sealed record LoadedDraftPrint(
        Guid? Id,
        PrintArea Area,
        PrintSize Size,
        Guid? UploadedAssetId,
        string? UploadedAssetUrl,
        string? DesignNote,
        string? PrintNotes);
}
