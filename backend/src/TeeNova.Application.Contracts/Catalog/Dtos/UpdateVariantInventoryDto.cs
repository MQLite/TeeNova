using System.ComponentModel.DataAnnotations;

namespace TeeNova.Catalog.Dtos;

/// <summary>
/// Admin payload for recording informational inventory against a product variant (Jira 9002).
/// Replaces the previously dead <c>UpdateStockDto</c> stub. Inventory is informational only —
/// it never blocks checkout, hides variants, or deducts stock.
/// </summary>
public class UpdateVariantInventoryDto
{
    /// <summary>Required inventory state. Accepts the enum name (e.g. "InStock").</summary>
    [Required]
    [EnumDataType(typeof(VariantInventoryStatus))]
    public VariantInventoryStatus InventoryStatus { get; set; }

    /// <summary>On-hand quantity. Null = not tracked. Forced to null when status is NotRecorded.</summary>
    [Range(0, int.MaxValue)]
    public int? StockQuantity { get; set; }

    /// <summary>Optional manual low-stock threshold.</summary>
    [Range(0, int.MaxValue)]
    public int? LowStockThreshold { get; set; }

    /// <summary>Optional free-text note (e.g. shelf location).</summary>
    [MaxLength(CatalogConsts.MaxInventoryNoteLength)]
    public string? Note { get; set; }
}
