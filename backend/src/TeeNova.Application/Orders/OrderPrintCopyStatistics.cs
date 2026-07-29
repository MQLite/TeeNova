using System;
using System.Collections.Generic;

namespace TeeNova.Orders;

/// <summary>
/// Internal, immutable print-copy projection for the production PDF (Jira 10106).
/// It is derived solely from the loaded order snapshot and is not part of the public order contract.
/// </summary>
internal sealed record OrderPrintCopyStatistics(
    int TotalPrintCopies,
    IReadOnlyList<OrderPrintSizeTotal> SizeTotals,
    IReadOnlyList<OrderPrintCopyGroup> DetailedGroups);

/// <summary>
/// One row in the order-level print-size roll-up. Standard A-size variants may share a row; custom
/// sizes retain their exact print-size identity.
/// </summary>
internal sealed record OrderPrintSizeTotal(
    string CanonicalSizeKey,
    string DisplayLabel,
    int CopyCount,
    IReadOnlyList<Guid> SourcePrintSizeIds,
    bool CombinesMultipleSizeRecords,
    bool IsStandardASize,
    int? ASizeNumber,
    bool IsUnspecified);

/// <summary>
/// One exact design + print-position + print-size group. Display labels are safe for operators while
/// the internal identity and source ids retain exact snapshot traceability.
/// </summary>
internal sealed record OrderPrintCopyGroup(
    string DesignKey,
    string DesignLabel,
    Guid? UploadedAssetId,
    Guid PrintAreaId,
    string PrintAreaLabel,
    Guid PrintSizeId,
    string PrintSizeLabel,
    bool IsStandardASize,
    int? ASizeNumber,
    int CopyCount,
    IReadOnlyList<Guid> SourceOrderItemIds,
    IReadOnlyList<Guid> SourceOrderItemPrintIds,
    IReadOnlyList<OrderPrintCopyMembership> Memberships);

/// <summary>
/// A single physical-print membership. Quantity belongs to the source order item and therefore
/// contributes in full once for every membership.
/// </summary>
internal sealed record OrderPrintCopyMembership(
    Guid SourceOrderItemId,
    Guid SourceOrderItemPrintId,
    int Quantity,
    string ProductName,
    string Colour,
    string GarmentSize,
    string? ProductionNote);
