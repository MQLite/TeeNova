using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using TeeNova.Catalog;
using TeeNova.Orders;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Timing;
using Volo.Abp.Users;

namespace TeeNova.Inventory;

/// <inheritdoc />
public class InventoryDeductionService : IInventoryDeductionService
{
    private readonly IRepository<ProductVariant, Guid> _variantRepository;
    private readonly IClock _clock;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<InventoryDeductionService> _logger;

    public InventoryDeductionService(
        IRepository<ProductVariant, Guid> variantRepository,
        IClock clock,
        ICurrentUser currentUser,
        ILogger<InventoryDeductionService> logger)
    {
        _variantRepository = variantRepository;
        _clock = clock;
        _currentUser = currentUser;
        _logger = logger;
    }

    public async Task DeductForOrderAsync(Order order)
    {
        foreach (var item in order.Items)
        {
            // Only items flagged eligible at creation time, and not already processed.
            if (!item.InventoryDeductionEligible || item.InventoryDeductedAt != null)
                continue;

            var variant = await _variantRepository.FindAsync(item.ProductVariantId);

            // NotRecorded / null stock / missing variant: nothing to deduct. We still stamp the
            // item as processed because the production step has passed — leaving it unprocessed
            // would cause a repeated (futile) attempt on any later transition. Stock is untouched.
            if (variant == null
                || variant.InventoryStatus == VariantInventoryStatus.NotRecorded
                || variant.StockQuantity == null)
            {
                item.InventoryDeductedAt = _clock.Now;
                _logger.LogInformation(
                    "[InventoryDeduction] OrderItem={OrderItemId} marked processed without deduction (variant missing/NotRecorded/null stock). VariantId={VariantId}",
                    item.Id, item.ProductVariantId);
                continue;
            }

            // Clamp at 0 — never allow negative stock (the codebase has no negative-stock concept).
            var newQuantity = Math.Max(0, variant.StockQuantity.Value - item.Quantity);

            variant.StockQuantity = newQuantity;
            RecalculateStatus(variant);
            variant.InventoryUpdatedAt = _clock.Now;
            variant.InventoryUpdatedBy = _currentUser.UserName;

            await _variantRepository.UpdateAsync(variant, autoSave: false);

            item.InventoryDeductedAt = _clock.Now;

            _logger.LogInformation(
                "[InventoryDeduction] OrderId={OrderId} OrderItem={OrderItemId} VariantId={VariantId} Deducted={Deducted} NewStock={NewStock} Status={Status}",
                order.Id, item.Id, variant.Id, item.Quantity, newQuantity, variant.InventoryStatus);
        }
    }

    /// <summary>
    /// Deterministic post-deduction status. Only called when StockQuantity is non-null and the
    /// variant was being tracked (not NotRecorded). Never touches IsAvailable.
    /// </summary>
    private static void RecalculateStatus(ProductVariant variant)
    {
        var qty = variant.StockQuantity ?? 0;

        if (qty <= 0)
        {
            variant.StockQuantity = 0;
            variant.InventoryStatus = VariantInventoryStatus.OutOfStock;
        }
        else if (variant.LowStockThreshold.HasValue && qty <= variant.LowStockThreshold.Value)
        {
            variant.InventoryStatus = VariantInventoryStatus.LowStock;
        }
        else
        {
            variant.InventoryStatus = VariantInventoryStatus.InStock;
        }
    }
}
