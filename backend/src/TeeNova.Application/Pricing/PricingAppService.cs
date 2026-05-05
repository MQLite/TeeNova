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
    private readonly IRepository<Catalog.Product, Guid> _productRepository;
    private readonly IRepository<PrintArea, Guid>        _printAreaRepository;
    private readonly IRepository<PrintSize, Guid>        _printSizeRepository;
    private readonly PrintConfigValidator                 _printConfigValidator;

    public PricingAppService(
        IRepository<Catalog.Product, Guid> productRepository,
        IRepository<PrintArea, Guid>        printAreaRepository,
        IRepository<PrintSize, Guid>        printSizeRepository,
        PrintConfigValidator                printConfigValidator)
    {
        _productRepository    = productRepository;
        _printAreaRepository  = printAreaRepository;
        _printSizeRepository  = printSizeRepository;
        _printConfigValidator = printConfigValidator;
    }

    public async Task<PriceCalculationResponseDto> CalculateAsync(PriceCalculationRequestDto input)
    {
        // ── 1. Validate quantity ────────────────────────────────────────────────
        if (input.Quantity <= 0)
            throw new BusinessException("TeeNova:Pricing:InvalidQuantity")
                .WithData("Quantity", input.Quantity);

        // ── 2. Load and validate Product ────────────────────────────────────────
        var productQuery = await _productRepository.GetQueryableAsync();
        var product = await productQuery
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == input.ProductId)
            ?? throw new EntityNotFoundException(typeof(Catalog.Product), input.ProductId);

        if (!product.IsActive)
            throw new BusinessException("TeeNova:Pricing:ProductInactive")
                .WithData("ProductId", input.ProductId)
                .WithData("ProductName", product.Name);

        // ── 3. Validate Variant ─────────────────────────────────────────────────
        var variant = product.Variants.FirstOrDefault(v => v.Id == input.VariantId)
            ?? throw new BusinessException("TeeNova:Pricing:VariantNotFound")
                .WithData("VariantId", input.VariantId)
                .WithData("ProductId", input.ProductId);

        if (!variant.IsAvailable)
            throw new BusinessException("TeeNova:Pricing:VariantUnavailable")
                .WithData("VariantId", input.VariantId)
                .WithData("VariantLabel", $"{variant.Color} / {variant.Size}");

        // ── 4. Load and validate PrintArea / PrintSize entries ──────────────────
        var prints = await LoadAndValidatePrintsAsync(input.Prints);

        // ── 5. Calculate breakdown ──────────────────────────────────────────────
        var result = PriceCalculator.Calculate(
            product.BasePrice,
            variant.PriceAdjustment,
            prints,
            input.Quantity);

        Logger.LogInformation(
            "[PricingQuote] ProductId={ProductId} VariantId={VariantId} Quantity={Quantity} PrintCount={PrintCount} UnitPrice={UnitPrice} LineTotal={LineTotal}",
            input.ProductId,
            input.VariantId,
            input.Quantity,
            prints.Count,
            result.UnitPrice,
            result.LineTotal);

        return result;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
