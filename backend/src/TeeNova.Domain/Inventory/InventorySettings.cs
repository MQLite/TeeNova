using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Inventory;

/// <summary>
/// Singleton row of admin-editable inventory settings (Jira 9005 follow-up).
/// Replaces the former <c>Inventory:AutoDeductOnPressedEnabled</c> config flag with a
/// DB-backed, runtime-toggleable value (no app restart required).
/// </summary>
public class InventorySettings : Entity<Guid>
{
    /// <summary>Well-known singleton ID — there is exactly one row in this table.</summary>
    public static readonly Guid SingletonId = new("a1b2c3d4-e5f6-0000-0000-000000000002");

    /// <summary>
    /// When true, new orders become eligible for automatic stock deduction at the
    /// production-complete transition (order marked Ready). Default false.
    /// </summary>
    public bool AutoDeductOnPressedEnabled { get; set; }

    public DateTime? LastModificationTime { get; set; }
    public Guid?     LastModifierId       { get; set; }

    protected InventorySettings() { }

    public InventorySettings(Guid id) : base(id) { }
}
