using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Orders;

/// <summary>
/// Immutable, order-owned description of a product that did not exist in the
/// catalogue when an AI-reviewed import was materialized.
/// </summary>
public class OrderAdHocProductSnapshot : Entity<Guid>
{
    public Guid OrderId { get; private set; }
    public string DisplayName { get; private set; } = default!;
    public string WrittenName { get; private set; } = default!;
    public string? Brand { get; private set; }
    public string? SupplierName { get; private set; }
    public string? SupplierCode { get; private set; }
    public string? SupplySource { get; private set; }
    public OrderAdHocInventoryBehavior InventoryBehavior { get; private set; }
    public string ConfirmedImportGroupId { get; private set; } = default!;
    public int ConfirmedRevision { get; private set; }
    public string? PrintingDetailsJson { get; private set; }

    protected OrderAdHocProductSnapshot()
    {
    }

    public OrderAdHocProductSnapshot(
        Guid id,
        Guid orderId,
        string displayName,
        string writtenName,
        string? brand,
        string? supplierName,
        string? supplierCode,
        string? supplySource,
        string confirmedImportGroupId,
        int confirmedRevision,
        string? printingDetailsJson)
        : base(id)
    {
        if (orderId == Guid.Empty)
            throw new ArgumentException("OrderId is required.", nameof(orderId));
        if (confirmedRevision < 1)
            throw new ArgumentOutOfRangeException(nameof(confirmedRevision));

        OrderId = orderId;
        DisplayName = Required(displayName, 256, nameof(displayName));
        WrittenName = Required(writtenName, 256, nameof(writtenName));
        Brand = Optional(brand, 128);
        SupplierName = Optional(supplierName, 256);
        SupplierCode = Optional(supplierCode, 128);
        SupplySource = Optional(supplySource, 32);
        InventoryBehavior = OrderAdHocInventoryBehavior.NotTracked;
        ConfirmedImportGroupId = Required(
            confirmedImportGroupId,
            128,
            nameof(confirmedImportGroupId));
        ConfirmedRevision = confirmedRevision;
        PrintingDetailsJson = string.IsNullOrWhiteSpace(printingDetailsJson)
            ? null
            : printingDetailsJson;
    }

    private static string Required(string value, int maximumLength, string name)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > maximumLength)
            throw new ArgumentException($"A value of at most {maximumLength} characters is required.", name);
        return normalized;
    }

    private static string? Optional(string? value, int maximumLength)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;
        if (normalized.Length > maximumLength)
            throw new ArgumentException($"A value of at most {maximumLength} characters is required.");
        return normalized;
    }
}
