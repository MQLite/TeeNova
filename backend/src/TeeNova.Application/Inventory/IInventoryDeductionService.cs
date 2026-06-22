using System.Threading.Tasks;
using TeeNova.Orders;

namespace TeeNova.Inventory;

/// <summary>
/// Performs optional, idempotent inventory deduction for an order at the production-complete
/// transition (Jira 9005). Informational-only inventory: deduction never blocks the order
/// transition, never affects checkout, and never touches sellability (IsAvailable).
/// </summary>
public interface IInventoryDeductionService
{
    /// <summary>
    /// Deducts stock for every eligible, not-yet-processed item on the given order (which must be
    /// loaded with its Items). Safe to call repeatedly — already-processed items are skipped.
    /// Mutates tracked variant entities and stamps each processed item's InventoryDeductedAt;
    /// the caller persists within the same unit of work.
    /// </summary>
    Task DeductForOrderAsync(Order order);
}
