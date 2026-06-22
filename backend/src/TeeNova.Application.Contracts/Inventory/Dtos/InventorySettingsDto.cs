using System;

namespace TeeNova.Inventory.Dtos;

/// <summary>Admin-editable inventory settings (DB-backed).</summary>
public class InventorySettingsDto
{
    /// <summary>
    /// When true, new orders are eligible for automatic stock deduction once marked Ready.
    /// Default false. Toggling this does not affect orders created before the change.
    /// </summary>
    public bool AutoDeductOnPressedEnabled { get; set; }

    /// <summary>When the setting was last changed (read-only).</summary>
    public DateTime? LastModificationTime { get; set; }
}
