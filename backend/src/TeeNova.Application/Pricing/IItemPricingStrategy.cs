using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Catalog;
using TeeNova.Orders;

namespace TeeNova.Pricing;

/// <summary>
/// Per-item pricing strategy (Jira 9503). The pricing orchestration (<see cref="Orders.OrderContentPricingService"/>)
/// and the quote service dispatch one of these by <see cref="Product.PricingModel"/>, so every pricing
/// model resolves through a single, model-specific code path and the client never supplies prices.
///
/// Implementations are <c>ITransientDependency</c> and self-declare the model they handle via
/// <see cref="Model"/>. The garment implementation reproduces the existing Epic 9200 behavior exactly.
/// </summary>
public interface IItemPricingStrategy
{
    /// <summary>The pricing model this strategy handles.</summary>
    PricingModel Model { get; }

    /// <summary>Prices one draft item against its product, returning a fully-snapshotted priced row.</summary>
    Task<PricedOrderItem> PriceItemAsync(ItemPricingContext context);
}

/// <summary>
/// Everything a strategy needs to price one item, assembled once by the orchestrator (Jira 9503).
/// Garment-only aids (<see cref="GarmentGroupQuantity"/> / <see cref="GarmentGroupTiers"/>) are
/// populated for <see cref="PricingModel.GarmentPrint"/> items and ignored by other strategies.
/// </summary>
public sealed class ItemPricingContext
{
    public required Product Product { get; init; }
    public required OrderDraftItem Item { get; init; }

    /// <summary>Garment print-tier scope: total quantity across the item's PrintPricingGroup. 0 for non-garment.</summary>
    public int GarmentGroupQuantity { get; init; }

    /// <summary>The item's effective group print tiers, or null (ungrouped / non-garment / inactive group).</summary>
    public IReadOnlyList<Catalog.ProductPrintPriceTier>? GarmentGroupTiers { get; init; }
}
