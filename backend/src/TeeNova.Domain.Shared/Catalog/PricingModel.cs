namespace TeeNova.Catalog;

/// <summary>
/// Pricing behavior of a product (Jira 9502/9503). The single behavioral discriminator the pricing
/// strategy seam dispatches on (<c>IItemPricingStrategy</c>). Separate from <see cref="ProductKind"/>
/// (category / UI dispatch) so one category can later support several pricing models.
///
/// Existing products backfill to <see cref="GarmentPrint"/>.
/// </summary>
public enum PricingModel
{
    /// <summary>Current Epic 9200 behavior: fixed garment base + Σ resolved print-tier prices.</summary>
    GarmentPrint = 0,

    /// <summary>Badge (Jira 9503): unit price resolved by quantity break; total = unit × quantity.</summary>
    QuantityTierUnit = 1,

    /// <summary>Banner (future): per fixed-size price.</summary>
    FixedSize = 2,

    /// <summary>Banner (future): rate × width × height with a minimum charge.</summary>
    AreaBased = 3,

    /// <summary>No automated price; admin sets the total (Banner MVP / manual quote). Schema-only here.</summary>
    CustomQuoteOnly = 4,
}
