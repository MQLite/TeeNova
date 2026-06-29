using System.Collections.Generic;

namespace TeeNova.Orders.Dtos;

/// <summary>
/// Result of a non-persisting admin order-content preview (Jira 9405). Returns the repriced order
/// (authoritative server pricing), the regrouped print read model, and the payment impact, so the
/// 9406 edit UI can show the new total, balance and warnings BEFORE saving.
/// </summary>
public class OrderContentQuoteResultDto
{
    public decimal OldTotalAmount { get; set; }
    public decimal NewTotalAmount { get; set; }

    /// <summary>
    /// Repriced preview order. <see cref="OrderDto.Items"/> carry the recalculated UnitPrice and each
    /// print's resolved price; <see cref="OrderDto.PrintGroups"/> is the regrouped preview; the payment
    /// fields reflect the previewed (not yet persisted) recalculation. Item/print Ids on brand-new rows
    /// are ephemeral preview Ids and are NOT the Ids that will be persisted on save.
    /// </summary>
    public OrderDto PreviewOrder { get; set; } = default!;

    public PaymentImpactDto Payment { get; set; } = default!;

    /// <summary>Human-readable, non-blocking notes (e.g. pending sessions will be cancelled).</summary>
    public List<string> Warnings { get; set; } = new();
}
