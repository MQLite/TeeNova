using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.PrintConfig;
using TeeNova.Pricing.Dtos;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Pricing;

/// <summary>
/// Quote-only pricing service. Loads current entity data, validates, and returns a
/// price breakdown. Does NOT persist anything.
/// </summary>
public class PricingAppService : ApplicationService, IPricingAppService
{
    private readonly IRepository<Catalog.Product, Guid>               _productRepository;
    private readonly IRepository<Catalog.PrintPricingGroup, Guid>     _printPricingGroupRepository;
    private readonly IRepository<Catalog.ProductPrintPriceTier, Guid> _printPriceTierRepository;
    private readonly IRepository<Catalog.ProductQuantityPriceTier, Guid> _quantityPriceTierRepository;
    private readonly IRepository<Catalog.ProductFixedSizePriceOption, Guid> _fixedSizeOptionRepository;
    private readonly IRepository<PrintArea, Guid>                     _printAreaRepository;
    private readonly IRepository<PrintSize, Guid>                     _printSizeRepository;
    private readonly PrintConfigValidator                             _printConfigValidator;
    private readonly Catalog.ProductPrintConfigOptionResolver         _printConfigOptionResolver;

    public PricingAppService(
        IRepository<Catalog.Product, Guid>               productRepository,
        IRepository<Catalog.PrintPricingGroup, Guid>     printPricingGroupRepository,
        IRepository<Catalog.ProductPrintPriceTier, Guid> printPriceTierRepository,
        IRepository<Catalog.ProductQuantityPriceTier, Guid> quantityPriceTierRepository,
        IRepository<Catalog.ProductFixedSizePriceOption, Guid> fixedSizeOptionRepository,
        IRepository<PrintArea, Guid>                     printAreaRepository,
        IRepository<PrintSize, Guid>                     printSizeRepository,
        PrintConfigValidator                             printConfigValidator,
        Catalog.ProductPrintConfigOptionResolver         printConfigOptionResolver)
    {
        _productRepository         = productRepository;
        _printPricingGroupRepository = printPricingGroupRepository;
        _printPriceTierRepository  = printPriceTierRepository;
        _quantityPriceTierRepository = quantityPriceTierRepository;
        _fixedSizeOptionRepository = fixedSizeOptionRepository;
        _printAreaRepository       = printAreaRepository;
        _printSizeRepository       = printSizeRepository;
        _printConfigValidator      = printConfigValidator;
        _printConfigOptionResolver = printConfigOptionResolver;
    }

    public async Task<PriceCalculationResponseDto> CalculateAsync(PriceCalculationRequestDto input)
    {
        // 1. Validate quantity
        if (input.Quantity <= 0)
            throw new BusinessException("TeeNova:Pricing:InvalidQuantity")
                .WithData("Quantity", input.Quantity);

        // 2. Load and validate Product
        var productQuery = await _productRepository.GetQueryableAsync();
        var product = await productQuery
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == input.ProductId)
            ?? throw new EntityNotFoundException(typeof(Catalog.Product), input.ProductId);

        if (!product.IsActive)
            throw new BusinessException("TeeNova:Pricing:ProductInactive")
                .WithData("ProductId", input.ProductId)
                .WithData("ProductName", product.Name);

        // 2b. Dispatch by pricing model (Jira 9503). Garment quote behavior below is unchanged; Badge
        // resolves a quantity-tier unit price; other models have no storefront quote yet.
        return product.PricingModel switch
        {
            Catalog.PricingModel.GarmentPrint     => await CalculateGarmentAsync(product, input),
            Catalog.PricingModel.QuantityTierUnit => await CalculateQuantityTierUnitAsync(product, input),
            Catalog.PricingModel.FixedSize        => await CalculateFixedSizeAsync(product, input),
            // CustomQuoteOnly (Banner enquiry-first) and AreaBased have no automatic storefront quote.
            _ => throw new BusinessException("TeeNova:Pricing:QuoteNotSupportedForPricingModel")
                    .WithData("ProductId", product.Id)
                    .WithData("PricingModel", product.PricingModel),
        };
    }

    public async Task<BatchPriceCalculationResponseDto> CalculateBatchAsync(
        BatchPriceCalculationRequestDto input)
    {
        var response = new BatchPriceCalculationResponseDto();

        // Deliberately sequential: the public HTTP request is already bounded to 50 entries and the
        // repository-backed authoritative quote path remains the single source of pricing truth.
        foreach (var item in input.Items)
        {
            try
            {
                response.Results.Add(new BatchPriceCalculationResultDto
                {
                    CorrelationKey = item.CorrelationKey,
                    Quote = await CalculateAsync(item.Request),
                });
            }
            catch (BusinessException exception)
            {
                response.Results.Add(new BatchPriceCalculationResultDto
                {
                    CorrelationKey = item.CorrelationKey,
                    ErrorCode = exception.Code ?? "TeeNova:Pricing:InvalidConfiguration",
                });
            }
        }

        return response;
    }

    /// <summary>
    /// Banner FixedSize quote (Jira 9516): resolves the selected <see cref="Catalog.ProductFixedSizePriceOption"/>
    /// unit price (no variant, no prints). The client sends only the selected option id via
    /// <c>BannerDetail.SizePresetId</c>; the server ignores any client dimensions and prices as
    /// unit × quantity. Enforces the product minimum quantity and that the option is active + belongs to
    /// the product. Design upload is not needed to quote (mirrors the Badge quote).
    /// </summary>
    private async Task<PriceCalculationResponseDto> CalculateFixedSizeAsync(
        Catalog.Product product, PriceCalculationRequestDto input)
    {
        if (input.Quantity < product.MinimumQuantity)
            throw new BusinessException("TeeNova:Pricing:BelowMinimumQuantity")
                .WithData("ProductId", product.Id)
                .WithData("MinimumQuantity", product.MinimumQuantity)
                .WithData("Quantity", input.Quantity);

        var presetId = input.BannerDetail?.SizePresetId
            ?? throw new BusinessException("TeeNova:Pricing:FixedSizeOptionRequired")
                .WithData("ProductId", product.Id);

        var option = await _fixedSizeOptionRepository.FindAsync(presetId)
            ?? throw new BusinessException("TeeNova:Pricing:FixedSizeOptionNotFound")
                .WithData("ProductId", product.Id)
                .WithData("SizePresetId", presetId);

        if (option.ProductId != product.Id)
            throw new BusinessException("TeeNova:Pricing:FixedSizeOptionProductMismatch")
                .WithData("ProductId", product.Id)
                .WithData("SizePresetId", presetId);

        if (!option.IsActive)
            throw new BusinessException("TeeNova:Pricing:FixedSizeOptionInactive")
                .WithData("ProductId", product.Id)
                .WithData("SizePresetId", presetId);

        var unit = option.UnitPrice;

        Logger.LogInformation(
            "[PricingQuote] ProductId={ProductId} PricingModel=FixedSize SizePresetId={SizePresetId} Quantity={Quantity} UnitPrice={UnitPrice} LineTotal={LineTotal}",
            product.Id, presetId, input.Quantity, unit, unit * input.Quantity);

        return new PriceCalculationResponseDto
        {
            ProductBasePrice            = 0m,
            VariantAdjustment           = 0m,
            PrintAddOns                 = new(),
            GarmentUnitPrice            = unit,  // whole unit price (no garment/print split for Banner)
            PrintUnitPrice              = 0m,
            UnitPrice                   = unit,
            Quantity                    = input.Quantity,
            LineTotal                   = unit * input.Quantity,
            Currency                    = "NZD",
            PricingMode                 = "FixedSize",
            AppliedTierMinQuantity      = null,
            AppliedTierUnitPrice        = null,
            NextTierMinQuantity         = null,
            NextTierUnitPrice           = null,
            IncludedStandardPrintAmount = 0m,
        };
    }

    /// <summary>Existing Epic 9200 garment quote — behavior unchanged (Jira 9503 just gated it by model).</summary>
    private async Task<PriceCalculationResponseDto> CalculateGarmentAsync(Catalog.Product product, PriceCalculationRequestDto input)
    {
        // 3. Validate Variant
        var variant = product.Variants.FirstOrDefault(v => input.VariantId.HasValue && v.Id == input.VariantId.Value)
            ?? throw new BusinessException("TeeNova:Pricing:VariantNotFound")
                .WithData("VariantId", input.VariantId?.ToString() ?? "(none)")
                .WithData("ProductId", product.Id);

        if (!variant.IsAvailable)
            throw new BusinessException("TeeNova:Pricing:VariantUnavailable")
                .WithData("VariantId", input.VariantId?.ToString() ?? "(none)")
                .WithData("VariantLabel", $"{variant.Color} / {variant.Size}");

        // 4. Load and validate PrintArea / PrintSize entries
        // First the global active-state + global matrix checks, then the product/size scoped
        // allowed-options narrowing (Jira 9204). Scoped check is a no-op for unconfigured products.
        var prints = await LoadAndValidatePrintsAsync(input.Prints);

        await _printConfigOptionResolver.ValidateSelectionAsync(
            product.Id,
            variant.Size,
            prints.Select(p => (p.AreaId, p.SizeId)).ToList());

        // 5. Resolve print-only tiers (Jira 9203)
        // Tier breaks are evaluated against the PrintPricingGroup's TOTAL quantity. The single-line
        // quote cannot know other products' quantities in the same group, so it uses the caller's
        // TierQuantity (the product-level page total) as the group quantity; full cross-product group
        // aggregation is done authoritatively at order creation (frontend follow-up tracked for 9207).
        var groupTiers    = await LoadGroupTiersAsync(product.PrintPricingGroupId);
        var groupQuantity = input.TierQuantity ?? input.Quantity;

        var resolvedPrints = prints
            .Select(entry => new ResolvedPrintAddOn(
                entry,
                PrintTierPriceResolver.Resolve(
                    groupTiers, variant.Size, entry.SizeId, groupQuantity, entry.SizePrice)))
            .ToList();

        // 6. Calculate breakdown (garment fixed + sum of resolved print prices)
        var result = PriceCalculator.Calculate(
            product.BasePrice,
            variant.PriceAdjustment,
            resolvedPrints,
            input.Quantity);

        Logger.LogInformation(
            "[PricingQuote] ProductId={ProductId} VariantId={VariantId} Quantity={Quantity} GroupQuantity={GroupQuantity} PrintCount={PrintCount} UnitPrice={UnitPrice} LineTotal={LineTotal}",
            input.ProductId,
            input.VariantId,
            input.Quantity,
            groupQuantity,
            prints.Count,
            result.UnitPrice,
            result.LineTotal);

        return result;
    }

    /// <summary>
    /// Badge quote (Jira 9503): resolves a quantity-tier unit price (no variant, no prints). Enforces
    /// the product minimum quantity. Garment-specific response fields are left empty/Badge-safe; the
    /// storefront reads UnitPrice / LineTotal. Design upload is not needed to quote (price = unit × qty).
    /// </summary>
    private async Task<PriceCalculationResponseDto> CalculateQuantityTierUnitAsync(
        Catalog.Product product, PriceCalculationRequestDto input)
    {
        if (input.Quantity < product.MinimumQuantity)
            throw new BusinessException("TeeNova:Pricing:BelowMinimumQuantity")
                .WithData("ProductId", product.Id)
                .WithData("MinimumQuantity", product.MinimumQuantity)
                .WithData("Quantity", input.Quantity);

        var tiers = await _quantityPriceTierRepository.GetListAsync(t => t.ProductId == product.Id);
        var resolved = QuantityTierResolver.Resolve(tiers, input.Quantity)
            ?? throw new BusinessException("TeeNova:Pricing:NoQuantityTiers")
                .WithData("ProductId", product.Id);

        var unit = resolved.UnitPrice;

        Logger.LogInformation(
            "[PricingQuote] ProductId={ProductId} PricingModel=QuantityTierUnit Quantity={Quantity} AppliedTier={AppliedTier} UnitPrice={UnitPrice} LineTotal={LineTotal}",
            product.Id, input.Quantity, resolved.AppliedMinQuantity, unit, unit * input.Quantity);

        return new PriceCalculationResponseDto
        {
            ProductBasePrice            = 0m,
            VariantAdjustment           = 0m,
            PrintAddOns                 = new(),
            GarmentUnitPrice            = unit,  // whole unit price (no separate garment/print split for Badge)
            PrintUnitPrice              = 0m,
            UnitPrice                   = unit,
            Quantity                    = input.Quantity,
            LineTotal                   = unit * input.Quantity,
            Currency                    = "NZD",
            PricingMode                 = "Tiered",
            AppliedTierMinQuantity      = resolved.AppliedMinQuantity,
            AppliedTierUnitPrice        = unit,
            NextTierMinQuantity         = resolved.NextMinQuantity,
            NextTierUnitPrice           = resolved.NextUnitPrice,
            IncludedStandardPrintAmount = 0m,
        };
    }

    /// <summary>
    /// Loads the print price tiers for a product's effective <see cref="Catalog.PrintPricingGroup"/>.
    /// Returns null when the product is ungrouped or the group is inactive/missing
    /// (no tiers -> PrintSize.BasePrice fallback).
    /// </summary>
    private async Task<List<Catalog.ProductPrintPriceTier>?> LoadGroupTiersAsync(Guid? groupId)
    {
        if (groupId == null)
            return null;

        var group = await _printPricingGroupRepository.FindAsync(groupId.Value);
        if (group is not { IsActive: true })
            return null;

        return await _printPriceTierRepository.GetListAsync(t => t.PrintPricingGroupId == groupId.Value);
    }

    // Private helpers

    private async Task<IReadOnlyList<PrintPricingEntry>> LoadAndValidatePrintsAsync(
        IEnumerable<PrintCalculationItemDto> printDtos)
    {
        var result = new List<PrintPricingEntry>();
        var pairs  = new List<(PrintArea Area, PrintSize Size)>();

        foreach (var dto in printDtos)
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
            result.Add(new PrintPricingEntry(
                area.Id, area.Name, area.BasePrice,
                size.Id, size.Name, size.BasePrice));
        }

        // Validate that each (PrintArea, PrintSize) pair has an active PrintAreaSizeOption.
        // Uses a single batch query across all pairs.
        await _printConfigValidator.ValidatePrintCombinationsAsync(pairs);

        return result;
    }
}
