using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Orders;

/// <summary>
/// Builds an A4 production-sheet PDF for an order using QuestPDF (Community licence).
///
/// Order data is loaded through <see cref="IOrderAppService.GetAsync"/> so the PDF reuses the
/// exact enrichment (items, prints, payment fields) the admin UI already relies on. No state is
/// mutated and nothing is written to disk — the bytes are generated in memory and returned.
/// </summary>
public class OrderProductionPdfService : IOrderProductionPdfService, ITransientDependency
{
    private static readonly CultureInfo NzCulture = CultureInfo.GetCultureInfo("en-NZ");

    static OrderProductionPdfService()
    {
        // QuestPDF Community licence — free for orgs under USD 1M annual revenue (and all
        // non-profits / FOSS). Not AGPL. Set once before any document is generated.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private readonly IOrderAppService _orderAppService;

    public OrderProductionPdfService(IOrderAppService orderAppService)
    {
        _orderAppService = orderAppService;
    }

    public async Task<OrderProductionPdfResult> GenerateAsync(Guid orderId)
    {
        // Throws EntityNotFoundException (→ 404) when the order is missing.
        var order = await _orderAppService.GetAsync(orderId);

        var bytes = BuildDocument(order).GeneratePdf();

        return new OrderProductionPdfResult
        {
            Content = bytes,
            FileName = $"Order-{SanitizeForFileName(order.OrderNumber)}-production-sheet.pdf",
            ContentType = "application/pdf",
        };
    }

    // ── Document composition ────────────────────────────────────────────────────

    private Document BuildDocument(OrderDto order)
    {
        var generatedAt = FormatDateTime(DateTime.UtcNow);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.2f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor("#1a1a1a"));

                page.Header().Element(c => ComposeHeader(c, order, generatedAt));
                page.Content().PaddingVertical(6).Element(c => ComposeContent(c, order));
                page.Footer().Element(ComposeFooter);
            });
        });
    }

    private void ComposeHeader(IContainer container, OrderDto order, string generatedAt)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Column(left =>
                {
                    left.Item().Text("Otahuhu Printing Shop")
                        .FontSize(16).Bold();
                    left.Item().Text("Production Sheet")
                        .FontSize(11).FontColor(Colors.Grey.Darken1);
                });

                row.ConstantItem(230).Column(right =>
                {
                    right.Item().AlignRight().Text("ORDER")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                    right.Item().AlignRight().Text(order.OrderNumber)
                        .FontSize(19).Bold();
                    right.Item().AlignRight().PaddingTop(2).Text($"Generated {generatedAt}")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                    right.Item().AlignRight().Text(
                        $"Status: {order.Status}   ·   Payment: {FormatPaymentStatus(order.PaymentStatus)}")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                });
            });

            col.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
        });
    }

    private void ComposeContent(IContainer container, OrderDto order)
    {
        container.Column(col =>
        {
            col.Spacing(10);

            col.Item().Element(c => ComposeCustomerAndDelivery(c, order));
            col.Item().Element(c => ComposeOrderSummary(c, order));
            col.Item().Element(c => ComposeItems(c, order));
            col.Item().Element(c => ComposeNotes(c, order));
        });
    }

    // ── Sections ────────────────────────────────────────────────────────────────

    private void ComposeCustomerAndDelivery(IContainer container, OrderDto order)
    {
        Section(container, "Customer & Delivery", inner =>
        {
            inner.Row(row =>
            {
                row.RelativeItem().Column(c =>
                {
                    LabelValue(c, "Name", order.CustomerName);
                    LabelValue(c, "Email", order.CustomerEmail);
                    LabelValue(c, "Phone", string.IsNullOrWhiteSpace(order.ShippingAddress?.Phone)
                        ? "-" : order.ShippingAddress!.Phone!);
                });

                row.RelativeItem().Column(c =>
                {
                    LabelValue(c, "Delivery", FormatDeliveryMethod(order.DeliveryMethod));

                    if (order.DeliveryMethod == DeliveryMethod.Shipping && order.ShippingAddress != null)
                    {
                        LabelValue(c, "Ship to", FormatShippingAddress(order.ShippingAddress));
                    }
                });
            });
        });
    }

    private void ComposeOrderSummary(IContainer container, OrderDto order)
    {
        Section(container, "Order Summary", inner =>
        {
            inner.Row(row =>
            {
                row.RelativeItem().Column(c =>
                {
                    LabelValue(c, "Payment status", FormatPaymentStatus(order.PaymentStatus));
                    LabelValue(c, "Payment requirement", FormatRequirementType(order.PaymentRequirementType));
                    LabelValue(c, "Total amount", FormatMoney(order.TotalAmount));
                    if (order.RequiredDepositAmount.HasValue)
                        LabelValue(c, "Required deposit", FormatMoney(order.RequiredDepositAmount.Value));
                });

                row.RelativeItem().Column(c =>
                {
                    LabelValue(c, "Required payment", FormatMoney(order.RequiredPaymentAmount));
                    LabelValue(c, "Paid amount", FormatMoney(order.PaidAmount));
                    LabelValue(c, "Balance", FormatMoney(order.BalanceAmount));
                });
            });
        });
    }

    private void ComposeItems(IContainer container, OrderDto order)
    {
        // Jira 10104 — the flat one-row-per-order-item table is replaced by one block per ACTUAL product.
        // The product-first projection (Jira 10103) is built here from the snapshot already in hand: no
        // second order query, no catalogue query, no pricing, no persistence.
        var items = OrderProductionPdfModelBuilder.Build(order);

        Section(container, ItemsSectionTitle(items), inner =>
        {
            inner.Column(col =>
            {
                col.Item().Element(c => ComposeProductBlocks(c, items));

                // Jira 10106 — a dedicated pure projection supplies both the order-level size totals and
                // exact design + area-id + size-id groups. Counts are sums of source item quantities, once
                // per print membership; no row count, grouped product quantity or live catalogue value is
                // consulted.
                ComposePrintProduction(col, OrderPrintCopyStatisticsBuilder.Build(order));

                // Non-garment / design-only items (Badge, Jira 9505). These carry no print placements, so
                // they never appear in the print-production list above. Each is rendered with its product,
                // quantity, pricing, applied quantity tier and design (description, or file name when the
                // customer gave no description) — no variant,
                // print position, print size, or blank " / " artifacts. Banner items are excluded here and
                // rendered with their full structured detail in ComposeBannerItems (Jira 9514).
                ComposeDesignOnlyItems(col, order);
                ComposeBannerItems(col, order);
            });
        });
    }

    // ── Product blocks (Jira 10104) ─────────────────────────────────────────────

    /// <summary>
    /// "Items (3 products · 14 units)". The product and unit counts come from the projection, so the
    /// heading agrees with the blocks below it rather than counting raw order rows.
    /// </summary>
    private static string ItemsSectionTitle(ProductionPdfItemsModel items)
        => $"Items ({items.ProductCount} {Plural(items.ProductCount, "product")} · " +
           $"{items.TotalQuantity} {Plural(items.TotalQuantity, "unit")})";

    private static string Plural(int count, string noun) => count == 1 ? noun : noun + "s";

    private static void ComposeProductBlocks(IContainer container, ProductionPdfItemsModel items)
    {
        if (items.Sections.Count == 0)
        {
            container.Text("No items on this order.").FontSize(9).FontColor(Colors.Grey.Darken1);
            return;
        }

        container.Column(col =>
        {
            col.Spacing(8);

            foreach (var section in items.Sections)
            {
                // Pagination strategy. A Decoration renders its Before slot on EVERY page its content
                // spans, so a long product's heading repeats above the continued rows and the child-table
                // header repeats with it — continued rows stay unambiguously attached to their product.
                //
                // On top of that:
                //  · a small block uses PreventPageBreak() — it moves to the next page rather than being
                //    split. Unlike ShowEntire() it degrades gracefully instead of throwing a
                //    DocumentLayoutException when content cannot fit, so an unusually long note can never
                //    break the download;
                //  · a larger block uses EnsureSpace(), which only guarantees the heading plus the table
                //    header and first row start together, then pages normally. A big group is never forced
                //    onto one impossible page.
                var block = IsSmallBlock(section)
                    ? col.Item().PreventPageBreak()
                    : col.Item().EnsureSpace(ProductBlockMinStartHeight);

                block.Decoration(decoration =>
                {
                    decoration.Before().Element(c => ComposeProductHeader(c, section));
                    decoration.Content().Element(c => ComposeProductRows(c, section));
                });
            }
        });
    }

    /// <summary>Points reserved for a product heading + child-table header + one child row.</summary>
    private const float ProductBlockMinStartHeight = 78f;

    /// <summary>Row count under which a product block is kept whole on one page.</summary>
    private const int SmallBlockRowLimit = 6;

    /// <summary>Estimated rendered line count under which a product block is kept whole on one page.</summary>
    private const int SmallBlockLineLimit = 14;

    /// <summary>
    /// Whether the block is small enough to keep intact. Both a row cap and a content-length estimate are
    /// applied, so a "few rows" block carrying very long notes is still allowed to page normally.
    /// </summary>
    private static bool IsSmallBlock(ProductionPdfProductSection section)
        => section.Rows.Count <= SmallBlockRowLimit
           && EstimatedLineCount(section) <= SmallBlockLineLimit;

    /// <summary>
    /// Conservative estimate of how many rendered text lines a product block occupies: every production
    /// line, plus a wrap allowance for long text. Deliberately pessimistic — over-estimating only costs a
    /// page break that would have been avoidable.
    /// </summary>
    private static int EstimatedLineCount(ProductionPdfProductSection section)
    {
        var lines = 0;
        foreach (var row in section.Rows)
        {
            var rowLines = 0;
            foreach (var line in row.ProductionLines)
                rowLines += 1 + line.Length / DetailCharsPerLine;

            // Colour and size wrap independently of the detail column.
            rowLines = Math.Max(rowLines, 1 + Math.Max(row.Colour.Length, row.Size.Length) / VariantCharsPerLine);
            lines += rowLines;
        }

        return lines;
    }

    private const int DetailCharsPerLine = 44;
    private const int VariantCharsPerLine = 22;

    /// <summary>
    /// The product identity and total quantity, shown once per product (and repeated at the top of each
    /// continued page). The kind is labelled only when it clarifies a non-garment item.
    /// </summary>
    private static void ComposeProductHeader(IContainer container, ProductionPdfProductSection section)
    {
        container.PaddingBottom(3).BorderTop(1).BorderColor(Colors.Grey.Medium).PaddingTop(4).Row(row =>
        {
            row.RelativeItem().Text(t =>
            {
                t.Span(section.ProductName).SemiBold().FontSize(10);
                if (section.KindLabel is not null)
                    t.Span($"   ·   {section.KindLabel}").FontSize(9).FontColor(Colors.Grey.Darken1);
            });

            row.ConstantItem(130).AlignRight().Text(t =>
            {
                t.Span("Total quantity  ").FontSize(9).FontColor(Colors.Grey.Darken1);
                t.Span(section.TotalQuantity.ToString(CultureInfo.InvariantCulture)).SemiBold().FontSize(10);
            });
        });
    }

    /// <summary>
    /// The product's child rows. Quantities come straight from the projection — nothing is recounted or
    /// regrouped here.
    ///
    /// Jira 10105 removed the two visual checklist columns; the width they held is reclaimed by the
    /// production-detail column, which takes the clear majority of it (see the width note below).
    /// </summary>
    private static void ComposeProductRows(IContainer container, ProductionPdfProductSection section)
    {
        var garment = section.Layout == ProductionPdfRowLayout.GarmentVariant;

        var schema = ChildTableColumns(section.Layout);

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                foreach (var column in schema)
                {
                    if (column.ConstantWidth > 0f)
                        columns.ConstantColumn(column.ConstantWidth);
                    else
                        columns.RelativeColumn(column.RelativeWidth);
                }
            });

            // Repeated by QuestPDF at the top of every page this table spans.
            table.Header(header =>
            {
                foreach (var column in schema)
                    HeaderCell(header.Cell(), column.Header, right: column.AlignRight);
            });

            foreach (var row in section.Rows)
            {
                if (garment)
                {
                    BodyCell(table.Cell()).Text(row.Colour);
                    BodyCell(table.Cell()).Text(row.Size);
                }

                BodyCell(table.Cell()).AlignRight().Text(row.Quantity.ToString(CultureInfo.InvariantCulture));
                BodyCell(table.Cell()).Text(row.ProductionSummary);
            }
        });
    }

    /// <summary>
    /// The child table's columns, in order — the single source of both the column definition and the
    /// header row, so the two can never disagree and the schema is directly assertable.
    ///
    /// Every column carries data and a header: there is no spacer, no unlabelled narrow column and no
    /// zero-width definition. Jira 10105 removed the "Clothes Finded" and "Finished" checklist columns
    /// from both layouts and gave the released width to the production-detail column.
    ///
    /// Widths on the A4 content width of 527.2 pt (595.28 pt page − 2 × 1.2 cm margins):
    /// <list type="bullet">
    ///   <item>Garment before: colour 2.2 · size 42 · qty 35 · details 4.4 · checks 1.6 + 1.4
    ///         ⇒ colour ≈ 103 pt, details ≈ 206 pt, checklist ≈ 141 pt.</item>
    ///   <item>Garment after: colour 2.0 · size 46 · qty 35 · details 5.5
    ///         ⇒ colour ≈ 119 pt, details ≈ 327 pt. Details takes ~121 pt of the ~141 pt released;
    ///         colour keeps enough for "Forest Green" on one line and size gains 4 pt so "One Size"
    ///         and "XXXXXL" stop wrapping.</item>
    ///   <item>Compact before: qty 35 · details 6.6 · checks 1.6 + 1.4 ⇒ details ≈ 338 pt.</item>
    ///   <item>Compact after: qty 35 · details (all remaining) ⇒ details ≈ 492 pt.</item>
    /// </list>
    /// </summary>
    internal static IReadOnlyList<ProductionPdfChildColumn> ChildTableColumns(ProductionPdfRowLayout layout)
        => layout == ProductionPdfRowLayout.GarmentVariant
            ? new[]
            {
                ProductionPdfChildColumn.Flexible("Colour", 2.0f),
                ProductionPdfChildColumn.Fixed("Size", 46f),
                ProductionPdfChildColumn.Fixed("Qty", 35f, alignRight: true),
                ProductionPdfChildColumn.Flexible("Production details", 5.5f),
            }
            : new[]
            {
                ProductionPdfChildColumn.Fixed("Qty", 35f, alignRight: true),
                ProductionPdfChildColumn.Flexible("Design / production details", 1f),
            };

    /// <summary>
    /// Jira 10106 print statistics: a compact order-level roll-up followed by exact, traceable detailed
    /// groups. The projection has already counted quantities; composition only displays it.
    /// </summary>
    private static void ComposePrintProduction(ColumnDescriptor col, OrderPrintCopyStatistics statistics)
    {
        var summaryContainer = statistics.SizeTotals.Count <= 10
            ? col.Item().PreventPageBreak()
            : col.Item().EnsureSpace(85);

        summaryContainer.PaddingTop(8).Column(summary =>
        {
            summary.Item().Text("Print production & copy counts").SemiBold().FontSize(10);

            if (statistics.TotalPrintCopies == 0)
            {
                summary.Item().PaddingTop(3).Text("No print placements on this order.")
                    .FontSize(9).FontColor(Colors.Grey.Darken1);
                return;
            }

            summary.Item().PaddingTop(4).Text("Print-size totals").SemiBold().FontSize(9);
            summary.Item().PaddingTop(2).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn();
                    columns.ConstantColumn(76);
                });

                table.Header(header =>
                {
                    HeaderCell(header.Cell(), "Print size");
                    HeaderCell(header.Cell(), "Copies", right: true);
                });

                foreach (var total in statistics.SizeTotals)
                {
                    BodyCell(table.Cell()).Text(total.DisplayLabel);
                    BodyCell(table.Cell()).AlignRight()
                        .Text(total.CopyCount.ToString(CultureInfo.InvariantCulture));
                }

                BodyCell(table.Cell()).BorderTop(1).BorderColor(Colors.Grey.Medium)
                    .Text("Total print copies").SemiBold();
                BodyCell(table.Cell()).BorderTop(1).BorderColor(Colors.Grey.Medium).AlignRight()
                    .Text(statistics.TotalPrintCopies.ToString(CultureInfo.InvariantCulture)).SemiBold();
            });

            if (statistics.SizeTotals.Any(total => total.IsStandardASize && total.CombinesMultipleSizeRecords))
                summary.Item().PaddingTop(2)
                    .Text("* Standard A-size labels differing only by case or spacing are combined.")
                    .FontSize(7).FontColor(Colors.Grey.Darken1);

            if (statistics.SizeTotals.Any(total => total.IsUnspecified && total.CombinesMultipleSizeRecords))
                summary.Item().PaddingTop(1)
                    .Text("* Multiple unspecified size records are combined.")
                    .FontSize(7).FontColor(Colors.Grey.Darken1);
        });

        foreach (var group in statistics.DetailedGroups)
            ComposeDetailedPrintGroup(col, group);
    }

    private static void ComposeDetailedPrintGroup(ColumnDescriptor col, OrderPrintCopyGroup group)
    {
        // Small blocks keep the established PreventPageBreak behaviour. Large or text-heavy groups may
        // continue safely, while EnsureSpace keeps the heading with at least the first content row.
        var estimatedCharacters = group.Memberships.Sum(membership =>
            membership.ProductName.Length + membership.Colour.Length + membership.GarmentSize.Length
            + (membership.ProductionNote?.Length ?? 0));
        var groupContainer = group.Memberships.Count <= 8 && estimatedCharacters <= 900
            ? col.Item().PreventPageBreak()
            : col.Item().EnsureSpace(62);

        groupContainer.PaddingTop(5).PaddingLeft(8).BorderLeft(2)
            .BorderColor(Colors.Grey.Lighten1).PaddingLeft(6).Decoration(decoration =>
            {
                decoration.Before().Element(header =>
                    header.PaddingBottom(2).Row(row =>
                    {
                        row.RelativeItem().Text(text =>
                        {
                            text.Span(group.DesignLabel).SemiBold().FontSize(9);
                            text.Span("\n");
                            text.Span($"{group.PrintAreaLabel} · {group.PrintSizeLabel}")
                                .FontSize(9).FontColor(Colors.Grey.Darken1);
                        });

                        row.ConstantItem(82).AlignRight().Text(
                                $"{group.CopyCount.ToString(CultureInfo.InvariantCulture)} " +
                                (group.CopyCount == 1 ? "copy" : "copies"))
                            .SemiBold().FontSize(9);
                    }));

                decoration.Content().Column(content =>
                {
                    var garments = group.Memberships
                        .GroupBy(membership => (membership.ProductName, membership.Colour))
                        .Select(bucket => new
                        {
                            bucket.Key,
                            Rows = bucket.ToList(),
                            FirstItemId = bucket.Min(row => row.SourceOrderItemId.ToString("N")),
                        })
                        .OrderBy(bucket => bucket.Key.ProductName, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(bucket => bucket.Key.ProductName, StringComparer.Ordinal)
                        .ThenBy(bucket => bucket.Key.Colour, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(bucket => bucket.Key.Colour, StringComparer.Ordinal)
                        .ThenBy(bucket => bucket.FirstItemId, StringComparer.Ordinal)
                        .ToList();

                    foreach (var garment in garments)
                    {
                        var sizes = garment.Rows.Select(row => row.GarmentSize)
                            .Where(size => size.Length > 0)
                            .Distinct(StringComparer.Ordinal)
                            .OrderBy(SizeRank)
                            .ThenBy(size => size, StringComparer.OrdinalIgnoreCase)
                            .ThenBy(size => size, StringComparer.Ordinal)
                            .ToList();
                        var variantText = sizes.Count > 0
                            ? $"{garment.Key.Colour} / {string.Join(", ", sizes)}"
                            : garment.Key.Colour;

                        content.Item().Text(text =>
                        {
                            text.Span($"{garment.Key.ProductName} · ")
                                .FontSize(9).FontColor(Colors.Grey.Darken1);
                            text.Span(variantText).FontSize(9).SemiBold();
                        });
                    }

                    foreach (var note in group.Memberships.Select(row => row.ProductionNote)
                                 .Where(note => note is not null).Cast<string>()
                                 .Distinct(StringComparer.Ordinal)
                                 .OrderBy(note => note, StringComparer.Ordinal))
                        content.Item().Text($"Print note: {note}").FontSize(8)
                            .FontColor(Colors.Grey.Darken1);
                });
            });
    }

    private void ComposeDesignOnlyItems(ColumnDescriptor col, OrderDto order)
    {
        // Badge (and any future non-garment, non-banner design-only kind). Banner has its own section.
        // Jira 10104 — explicitly ordered; this previously followed order.Items encounter order.
        var designOnly = order.Items
            .Where(i => i.ProductKind != ProductKind.Garment && i.ProductKind != ProductKind.Banner)
            .OrderBy(i => i.ProductName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => i.ProductName, StringComparer.Ordinal)
            .ThenBy(i => DesignLabel(i.UploadedAssetUrl, i.DesignNote), StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => DesignLabel(i.UploadedAssetUrl, i.DesignNote), StringComparer.Ordinal)
            .ThenBy(i => i.Quantity)
            .ThenBy(i => i.Id.ToString("N"), StringComparer.Ordinal)
            .ToList();
        if (designOnly.Count == 0)
            return;

        col.Item().PaddingTop(8).Text("Badge / design-only items").SemiBold().FontSize(10);

        foreach (var item in designOnly)
        {
            col.Item().PreventPageBreak().PaddingTop(4).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
                .PaddingLeft(6).Column(ic =>
                {
                    ic.Item().Text(t =>
                    {
                        t.Span(item.ProductName).SemiBold().FontSize(9);
                        t.Span($"  ·  Qty {item.Quantity.ToString(CultureInfo.InvariantCulture)}").FontSize(9);
                        t.Span($"  ·  {FormatMoney(item.UnitPrice)} ea").FontSize(9).FontColor(Colors.Grey.Darken1);
                        t.Span($"  ·  Line {FormatMoney(item.UnitPrice * item.Quantity)}").FontSize(9).FontColor(Colors.Grey.Darken1);
                    });

                    if (item.AppliedQuantityTierMinQuantity.HasValue)
                        ic.Item().Text($"Quantity tier: {item.AppliedQuantityTierMinQuantity.Value}+")
                            .FontSize(8).FontColor(Colors.Grey.Darken1);

                    ic.Item().Text($"Design: {DesignLabel(item.UploadedAssetUrl, item.DesignNote)}")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                });
        }
    }

    /// <summary>
    /// Banner production details (Jira 9514). Dimensions / material / finishing are made prominent for the
    /// production team. No print area/size, no variant, no Badge label. Falls back gracefully when the
    /// structured detail is missing.
    /// </summary>
    private void ComposeBannerItems(ColumnDescriptor col, OrderDto order)
    {
        // Jira 10104 — explicitly ordered; this previously followed order.Items encounter order. The
        // configuration label is the tiebreak because two banner lines of one product differ only by it.
        var banners = order.Items
            .Where(i => i.ProductKind == ProductKind.Banner)
            .OrderBy(i => i.ProductName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => i.ProductName, StringComparer.Ordinal)
            .ThenBy(i => BannerSortLabel(i.BannerDetail), StringComparer.Ordinal)
            .ThenBy(i => i.Quantity)
            .ThenBy(i => i.Id.ToString("N"), StringComparer.Ordinal)
            .ToList();
        if (banners.Count == 0)
            return;

        col.Item().PaddingTop(8).Text("Banner production details").SemiBold().FontSize(10);

        foreach (var item in banners)
        {
            col.Item().PreventPageBreak().PaddingTop(4).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
                .PaddingLeft(6).Column(ic =>
                {
                    ic.Item().Text(t =>
                    {
                        t.Span(item.ProductName).SemiBold().FontSize(9);
                        t.Span($"  ·  Qty {item.Quantity.ToString(CultureInfo.InvariantCulture)}").FontSize(9);
                        t.Span($"  ·  Line {FormatMoney(item.UnitPrice * item.Quantity)}").FontSize(9).FontColor(Colors.Grey.Darken1);
                    });

                    var d = item.BannerDetail;
                    if (d == null)
                    {
                        ic.Item().Text("Banner details unavailable").FontSize(8).FontColor(Colors.Grey.Darken1);
                    }
                    else
                    {
                        ic.Item().Text(t =>
                        {
                            t.Span("Size: ").SemiBold().FontSize(9);
                            t.Span(BannerDetailFormatter.SizeSummary(
                                d.SizeMode, d.Width, d.Height, d.Unit, d.AreaSquareMetres, d.SizeLabel)).FontSize(9);
                        });
                        ic.Item().Text(t =>
                        {
                            t.Span("Material: ").SemiBold().FontSize(9);
                            t.Span(BannerDetailFormatter.MaterialSummary(d.Material, d.MaterialDisplayName)).FontSize(9);
                        });
                        ic.Item().Text(t =>
                        {
                            t.Span("Finishing: ").SemiBold().FontSize(9);
                            t.Span(BannerDetailFormatter.FinishingSummary(
                                d.FinishingEyelets, d.FinishingHemming, d.FinishingPolePocket,
                                d.FinishingOther, d.StandIncluded, d.StandReplacementOnly)).FontSize(9);
                        });
                        if (!string.IsNullOrWhiteSpace(d.Notes))
                            ic.Item().Text($"Banner notes: {d.Notes}").FontSize(8).FontColor(Colors.Grey.Darken1);
                    }

                    ic.Item().Text($"Design: {DesignLabel(item.UploadedAssetUrl, item.DesignNote)}")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                });
        }
    }

    private void ComposeNotes(IContainer container, OrderDto order)
    {
        var hasCustomer = !string.IsNullOrWhiteSpace(order.Notes);
        var hasAdmin = !string.IsNullOrWhiteSpace(order.AdminNotes);
        if (!hasCustomer && !hasAdmin)
            return;

        Section(container, "Notes", inner =>
        {
            inner.Column(c =>
            {
                c.Spacing(6);
                if (hasCustomer)
                    c.Item().Column(b =>
                    {
                        b.Item().Text("Customer note").SemiBold().FontSize(9).FontColor(Colors.Grey.Darken1);
                        b.Item().Text(order.Notes!).FontSize(9);
                    });
                if (hasAdmin)
                    c.Item().Column(b =>
                    {
                        b.Item().Text("Admin / special instructions").SemiBold().FontSize(9).FontColor(Colors.Grey.Darken1);
                        b.Item().Text(order.AdminNotes!).FontSize(9);
                    });
            });
        });
    }

    private void ComposeFooter(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten1);
            col.Item().PaddingTop(4).Row(row =>
            {
                row.RelativeItem().Text("Otahuhu Printing Shop — internal production sheet")
                    .FontSize(8).FontColor(Colors.Grey.Darken1);
                row.ConstantItem(120).AlignRight().Text(t =>
                {
                    t.DefaultTextStyle(s => s.FontSize(8).FontColor(Colors.Grey.Darken1));
                    t.Span("Page ");
                    t.CurrentPageNumber();
                    t.Span(" of ");
                    t.TotalPages();
                });
            });
        });
    }

    // ── Reusable layout helpers ─────────────────────────────────────────────────

    private static void Section(IContainer container, string title, Action<IContainer> body)
    {
        container.Column(col =>
        {
            col.Item().Text(title).FontSize(11).Bold();
            col.Item().PaddingTop(2).PaddingBottom(4).LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
            col.Item().Element(body);
        });
    }

    private static void LabelValue(ColumnDescriptor col, string label, string value)
    {
        col.Item().PaddingBottom(2).Row(row =>
        {
            row.ConstantItem(100).Text(label).FontSize(9).FontColor(Colors.Grey.Darken1);
            row.RelativeItem().Text(value).FontSize(9);
        });
    }

    private static void HeaderCell(IContainer container, string text, bool right = false, bool center = false)
    {
        var cell = container.BorderBottom(1).BorderColor(Colors.Grey.Medium)
            .PaddingVertical(4).PaddingHorizontal(2);
        if (right) cell = cell.AlignRight();
        else if (center) cell = cell.AlignCenter();
        cell.Text(text).SemiBold().FontSize(9);
    }

    private static IContainer BodyCell(IContainer container)
        => container.BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(4).PaddingHorizontal(2)
            .DefaultTextStyle(s => s.FontSize(9));

    // CheckBoxCell was removed in Jira 10105 with the two checklist columns it existed to draw. The
    // frozen LegacyOrderProductionPdfBaseline keeps its own private copy on purpose — that is the
    // historical pre-10103 sheet and must not follow this change.

    // ── Formatting helpers ──────────────────────────────────────────────────────

    /// <summary>
    /// Culture-independent NZD money formatting, e.g. "1,250.00 NZD". Delegates to the shared
    /// <see cref="OrderProductGroupRowFormatter"/> (Jira 10104) so the sheet has one money format;
    /// the produced text is character-for-character what this method always produced.
    /// </summary>
    private static string FormatMoney(decimal value) => OrderProductGroupRowFormatter.Money(value);

    /// <summary>
    /// Deterministic, display-derived sort key for a Banner item: the same configuration text the sheet
    /// shows, so two banner lines of one product order by what visibly distinguishes them. Never used for
    /// grouping and never rendered.
    /// </summary>
    private static string BannerSortLabel(BannerDetailDto? detail)
    {
        if (detail == null)
            return string.Empty;

        return string.Join("|",
            BannerDetailFormatter.SizeSummary(
                detail.SizeMode, detail.Width, detail.Height, detail.Unit,
                detail.AreaSquareMetres, detail.SizeLabel),
            BannerDetailFormatter.MaterialSummary(detail.Material, detail.MaterialDisplayName),
            BannerDetailFormatter.FinishingSummary(
                detail.FinishingEyelets, detail.FinishingHemming, detail.FinishingPolePocket,
                detail.FinishingOther, detail.StandIncluded, detail.StandReplacementOnly),
            detail.Notes ?? string.Empty);
    }

    /// <summary>
    /// Splits a "Colour / Size" variant label into its parts, via the shared
    /// <see cref="OrderVariantLabelParser"/> (Jira 10103 — this file's private duplicate was removed).
    /// <c>ParseForDisplay</c> keeps the sheet's long-standing rendering-boundary behaviour of returning
    /// empty strings rather than nulls, so ordering, grouping and the rendered text are unchanged.
    /// </summary>
    private static (string Color, string Size) SplitVariantLabel(string? variantLabel)
        => OrderVariantLabelParser.ParseForDisplay(variantLabel);

    /// <summary>
    /// Ranks a garment size for sorting, via the shared <see cref="GarmentSizeOrder"/> helper
    /// (Jira 10103 — this file's private duplicate was removed; the semantics are identical).
    /// </summary>
    private static int SizeRank(string size) => GarmentSizeOrder.Rank(size);

    private static string FormatDateTime(DateTime utc)
    {
        var local = ToNzTime(utc);
        return local.ToString("dd MMM yyyy, h:mm tt", NzCulture) + " NZT";
    }

    private static DateTime ToNzTime(DateTime utc)
    {
        try
        {
            var tzId = OperatingSystem.IsWindows() ? "New Zealand Standard Time" : "Pacific/Auckland";
            var tz = TimeZoneInfo.FindSystemTimeZoneById(tzId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz);
        }
        catch
        {
            return utc; // Fall back to UTC if the timezone database is unavailable.
        }
    }

    private static string FormatDeliveryMethod(DeliveryMethod? method) => method switch
    {
        DeliveryMethod.Pickup => "Pickup",
        DeliveryMethod.Shipping => "Shipping",
        _ => "-",
    };

    private static string FormatRequirementType(PaymentRequirementType type) => type switch
    {
        PaymentRequirementType.DepositThenBalance => "Deposit then balance",
        PaymentRequirementType.FullPaymentRequired => "Full payment required",
        _ => type.ToString(),
    };

    private static string FormatPaymentStatus(PaymentStatus status) => status switch
    {
        PaymentStatus.Unpaid => "Unpaid",
        PaymentStatus.DepositRequired => "Deposit required",
        PaymentStatus.DepositPaid => "Deposit paid",
        PaymentStatus.PartiallyPaid => "Partially paid",
        PaymentStatus.Paid => "Paid",
        PaymentStatus.Refunded => "Refunded",
        PaymentStatus.PaymentFailed => "Payment failed",
        _ => status.ToString(),
    };

    private static string FormatShippingAddress(ShippingAddressDto a)
    {
        var sb = new StringBuilder();
        sb.Append(a.FullName);
        sb.Append('\n').Append(a.AddressLine1);
        if (!string.IsNullOrWhiteSpace(a.AddressLine2)) sb.Append('\n').Append(a.AddressLine2);
        sb.Append('\n').Append(a.City);
        if (!string.IsNullOrWhiteSpace(a.State)) sb.Append(", ").Append(a.State);
        if (!string.IsNullOrWhiteSpace(a.PostalCode)) sb.Append(' ').Append(a.PostalCode);
        if (!string.IsNullOrWhiteSpace(a.Country)) sb.Append('\n').Append(a.Country);
        return sb.ToString();
    }

    /// <summary>
    /// Returns a safe, display-only label for an uploaded design: the decoded filename
    /// (final path segment) only — never a scheme, domain, query string, fragment, or
    /// local filesystem path.
    ///
    /// Handles root-relative URLs ("/uploads/designs/file.png"), absolute URLs
    /// ("https://host/uploads/designs/file.png?v=1#preview" → "file.png"), URL-encoded
    /// names ("customer%20logo.png" → "customer logo.png"), and defensively strips any
    /// Windows-style path so "C:\uploads\…\file.png" can never surface as a local path.
    /// </summary>
    /// <summary>
    /// The core design file name used to identify the artwork across uploads. The storage layer prefixes
    /// every saved file with "{prefix}_{yyyyMMdd}_{6 chars}_" (see LocalFileStorageService), so the same
    /// artwork re-uploaded for each placement yields a different stored name. Stripping that generated
    /// prefix recovers the shared original name, letting the production list group identical designs.
    /// </summary>
    private static readonly System.Text.RegularExpressions.Regex GeneratedFilePrefix =
        new(@"^[A-Za-z]+_\d{8}_[0-9A-Za-z]{6}_", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static string DesignDisplayName(string? url)
        => GeneratedFilePrefix.Replace(DesignFileLabel(url), string.Empty);

    /// <summary>
    /// How a design is named on the sheet: the design description the customer gave (the design note),
    /// falling back to the uploaded file name when there is none. A description reads better on the
    /// production floor than a storage file name, and it also carries the customer's intent.
    /// </summary>
    private static string DesignLabel(string? url, string? designDescription)
        => string.IsNullOrWhiteSpace(designDescription)
            ? DesignDisplayName(url)
            : designDescription.Trim();

    private static string DesignFileLabel(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return "No design uploaded";

        var path = url.Trim();

        if (Uri.TryCreate(path, UriKind.Absolute, out var abs))
        {
            // AbsolutePath excludes scheme, host, query and fragment — no domain can leak.
            path = abs.AbsolutePath;
        }
        else
        {
            // Relative value: drop fragment first, then query string.
            var hashIdx = path.IndexOf('#');
            if (hashIdx >= 0) path = path[..hashIdx];
            var queryIdx = path.IndexOf('?');
            if (queryIdx >= 0) path = path[..queryIdx];
        }

        // Final segment only; split on both separators so neither a web directory nor a
        // Windows path component (e.g. a "C:" drive) can appear in the output.
        var tail = path.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
        if (string.IsNullOrWhiteSpace(tail))
            return "Design file attached";

        try { tail = Uri.UnescapeDataString(tail); } catch { /* keep raw tail */ }
        tail = tail.Trim();

        return tail.Length == 0 ? "Design file attached" : tail;
    }

    private static string SanitizeForFileName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "order";

        var invalid = System.IO.Path.GetInvalidFileNameChars();
        var cleaned = new string(value.Select(c => invalid.Contains(c) || c == ' ' ? '-' : c).ToArray());
        return cleaned.Trim('-', '.') is { Length: > 0 } s ? s : "order";
    }
}
