namespace TeeNova.Inventory;

/// <summary>
/// Inventory behavior configuration, bound from the "Inventory" appsettings section.
/// Config key: <c>Inventory:AutoDeductOnPressedEnabled</c>
/// (env var <c>Inventory__AutoDeductOnPressedEnabled</c>).
/// </summary>
public class InventoryOptions
{
    /// <summary>
    /// When true, new orders created while this flag is on become eligible for automatic
    /// stock deduction at the production-complete transition (order marked Ready). Default OFF —
    /// when off, inventory stays purely informational and no stock is ever deducted. Must remain
    /// false in production unless an operator explicitly enables it.
    /// </summary>
    public bool AutoDeductOnPressedEnabled { get; set; } = false;
}
