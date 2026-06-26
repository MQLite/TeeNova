using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
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
            col.Item().Element(ComposeChecklist);
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
        Section(container, $"Items ({order.Items.Count})", inner =>
        {
            inner.Column(col =>
            {
                col.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(3);    // product
                        columns.RelativeColumn(2);    // variant
                        columns.ConstantColumn(35);   // qty
                        columns.RelativeColumn(1.4f);  // unit price
                        columns.RelativeColumn(1.4f);  // line total
                    });

                    table.Header(header =>
                    {
                        HeaderCell(header.Cell(), "Product");
                        HeaderCell(header.Cell(), "Variant");
                        HeaderCell(header.Cell(), "Qty", right: true);
                        HeaderCell(header.Cell(), "Unit", right: true);
                        HeaderCell(header.Cell(), "Line total", right: true);
                    });

                    foreach (var item in order.Items)
                    {
                        BodyCell(table.Cell()).Text(item.ProductName);
                        BodyCell(table.Cell()).Text(item.VariantLabel);
                        BodyCell(table.Cell()).AlignRight().Text(item.Quantity.ToString(CultureInfo.InvariantCulture));
                        BodyCell(table.Cell()).AlignRight().Text(FormatMoney(item.UnitPrice));
                        BodyCell(table.Cell()).AlignRight().Text(FormatMoney(item.LineTotal));
                    }
                });

                // Print production list, grouped by the print instruction itself — design file, position
                // (print area) and print size. Every garment that takes that exact print is listed under it,
                // with sizes combined per product + colour (e.g. "Daisy Yellow / S, M, L, XL"). Per-size
                // quantities stay in the Items table above.
                var printRows = order.Items
                    .Where(i => i.Prints.Count > 0)
                    .SelectMany(item =>
                    {
                        var (color, size) = SplitVariantLabel(item.VariantLabel);
                        return item.Prints.Select(p => (
                            item.ProductName,
                            Color: color,
                            Size: size,
                            DesignUrl: p.UploadedAssetUrl ?? string.Empty,
                            Area: p.PrintAreaName,
                            PrintSize: p.PrintSizeName,
                            Notes: new[]
                            {
                                string.IsNullOrWhiteSpace(p.DesignNote) ? null : $"Design note: {p.DesignNote}",
                                string.IsNullOrWhiteSpace(p.Notes) ? null : $"Print note: {p.Notes}",
                            }.Where(n => n is not null).Select(n => n!).ToList()));
                    })
                    .ToList();

                if (printRows.Count > 0)
                    col.Item().PaddingTop(8).Text("Print production").SemiBold().FontSize(10);

                foreach (var group in printRows.GroupBy(r => (r.DesignUrl, r.Area, r.PrintSize)))
                {
                    var first = group.First();
                    var designLabel = DesignFileLabel(string.IsNullOrEmpty(first.DesignUrl) ? null : first.DesignUrl);

                    col.Item().PaddingTop(4).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
                        .PaddingLeft(6).Column(pc =>
                        {
                            pc.Item().Text(t =>
                            {
                                t.Span(designLabel).SemiBold().FontSize(9);
                                t.Span("  ·  ").FontSize(9).FontColor(Colors.Grey.Medium);
                                t.Span($"{first.Area} · {first.PrintSize}").FontSize(9);
                            });

                            // Each product + colour the print lands on, with its garment sizes combined.
                            foreach (var garment in group.GroupBy(r => (r.ProductName, r.Color)))
                            {
                                var g = garment.First();
                                var sizes = garment.Select(r => r.Size).Where(s => s.Length > 0).Distinct().ToList();
                                var variantText = sizes.Count > 0
                                    ? $"{g.Color} / {string.Join(", ", sizes)}"
                                    : g.Color;
                                pc.Item().Text(t =>
                                {
                                    t.Span($"{g.ProductName} · ").FontSize(9).FontColor(Colors.Grey.Darken1);
                                    t.Span(variantText).FontSize(9).SemiBold();
                                });
                            }

                            foreach (var note in group.SelectMany(r => r.Notes).Distinct())
                                pc.Item().Text(note).FontSize(8).FontColor(Colors.Grey.Darken1);
                        });
                }
            });
        });
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

    private void ComposeChecklist(IContainer container)
    {
        string[] steps =
        {
            "Artwork checked", "Printed", "Pressed",
            "Quality checked", "Packed", "Ready for pickup / shipping",
        };

        Section(container, "Production Checklist", inner =>
        {
            inner.Border(1).BorderColor(Colors.Grey.Lighten1).Background(Colors.Grey.Lighten5)
                .Padding(8).Column(col =>
            {
                col.Spacing(6);
                // Lay the steps three-across to keep the checklist to two rows.
                foreach (var rowSteps in steps.Chunk(3))
                {
                    col.Item().Row(row =>
                    {
                        foreach (var step in rowSteps)
                        {
                            row.RelativeItem().Row(cell =>
                            {
                                cell.ConstantItem(16).AlignMiddle().Height(11).Width(11)
                                    .Border(1).BorderColor(Colors.Grey.Darken2);
                                cell.RelativeItem().PaddingLeft(6).AlignMiddle().Text(step).FontSize(9);
                            });
                        }
                        // Pad the final partial row so cells keep equal width.
                        for (var i = rowSteps.Length; i < 3; i++) row.RelativeItem();
                    });
                }
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

    private static void HeaderCell(IContainer container, string text, bool right = false)
    {
        var cell = container.BorderBottom(1).BorderColor(Colors.Grey.Medium)
            .PaddingVertical(4).PaddingHorizontal(2);
        if (right) cell = cell.AlignRight();
        cell.Text(text).SemiBold().FontSize(9);
    }

    private static IContainer BodyCell(IContainer container)
        => container.BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(4).PaddingHorizontal(2)
            .DefaultTextStyle(s => s.FontSize(9));

    // ── Formatting helpers ──────────────────────────────────────────────────────

    /// <summary>Culture-independent NZD money formatting, e.g. "1,250.00 NZD".</summary>
    private static string FormatMoney(decimal value)
        => $"{value.ToString("N2", CultureInfo.InvariantCulture)} NZD";

    /// <summary>
    /// Splits a "Colour / Size" variant label into its parts. Splits on the last " / " so colours that
    /// contain a slash stay intact; returns an empty size when the label has no separator.
    /// </summary>
    private static (string Color, string Size) SplitVariantLabel(string variantLabel)
    {
        var label = variantLabel?.Trim() ?? string.Empty;
        var idx = label.LastIndexOf(" / ", StringComparison.Ordinal);
        return idx < 0
            ? (label, string.Empty)
            : (label[..idx].Trim(), label[(idx + 3)..].Trim());
    }

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
