using System;
using Volo.Abp.Domain.Entities.Auditing;
using TeeNova.Production;

namespace TeeNova.Production;

/// <summary>
/// Placeholder: represents a physical production job triggered after an order is confirmed.
/// Extend when integrating with a print provider API (Printful, Printify, custom ERP).
/// </summary>
public class ProductionJob : AuditedAggregateRoot<Guid>
{
    public Guid OrderId { get; set; }
    public ProductionStatus Status { get; set; } = ProductionStatus.Queued;
    public string? PrinterReference { get; set; }   // External printer job ID
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? Notes { get; set; }

    // Future: PrintJobItems, QualityCheckResult, PrinterMachineId

    protected ProductionJob() { }

    public ProductionJob(Guid id, Guid orderId) : base(id)
    {
        OrderId = orderId;
    }
}
