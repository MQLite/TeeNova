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
                page.Margin(1.5f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor("#1a1a1a"));

                page.Header().Element(c => ComposeHeader(c, order, generatedAt));
                page.Content().PaddingVertical(8).Element(c => ComposeContent(c, order));
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

                row.ConstantItem(220).Column(right =>
                {
                    right.Item().AlignRight().Text(order.OrderNumber)
                        .FontSize(15).Bold();
                    right.Item().AlignRight().Text($"Generated {generatedAt}")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                    right.Item().AlignRight().Text(
                        $"Order: {order.Status}   ·   Payment: {FormatPaymentStatus(order.PaymentStatus)}")
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
            col.Spacing(14);

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
                    LabelValue(c, "Payment requirement", FormatRequirementType(order.PaymentRequirementType));
                    LabelValue(c, "Total amount", FormatMoney(order.TotalAmount));
                    LabelValue(c, "Required payment", FormatMoney(order.RequiredPaymentAmount));
                });

                row.RelativeItem().Column(c =>
                {
                    if (order.RequiredDepositAmount.HasValue)
                        LabelValue(c, "Required deposit", FormatMoney(order.RequiredDepositAmount.Value));
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

                // Per-item print details, listed below the table so each can wrap freely.
                foreach (var item in order.Items.Where(i => i.Prints.Count > 0))
                {
                    col.Item().PaddingTop(8).Column(block =>
                    {
                        block.Item().Text(t =>
                        {
                            t.Span("Print details · ").SemiBold().FontSize(9);
                            t.Span($"{item.ProductName} ({item.VariantLabel})").FontSize(9).FontColor(Colors.Grey.Darken1);
                        });

                        foreach (var print in item.Prints.OrderBy(p => p.SortOrder))
                        {
                            block.Item().PaddingTop(3).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
                                .PaddingLeft(6).Column(pc =>
                                {
                                    pc.Item().Text(t =>
                                    {
                                        t.Span($"{print.PrintAreaName} ({print.PrintAreaCode})").SemiBold().FontSize(9);
                                        t.Span("  ·  ").FontSize(9).FontColor(Colors.Grey.Medium);
                                        t.Span($"{print.PrintSizeName} ({print.PrintSizeCode})").FontSize(9);
                                    });
                                    pc.Item().Text($"Design: {DesignFileLabel(print.UploadedAssetUrl)}")
                                        .FontSize(9).FontColor(Colors.Grey.Darken1);
                                    if (!string.IsNullOrWhiteSpace(print.DesignNote))
                                        pc.Item().Text($"Design note: {print.DesignNote}").FontSize(9);
                                    if (!string.IsNullOrWhiteSpace(print.Notes))
                                        pc.Item().Text($"Print note: {print.Notes}").FontSize(9);
                                });
                        }
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
            inner.Column(col =>
            {
                col.Spacing(6);
                foreach (var step in steps)
                {
                    col.Item().Row(row =>
                    {
                        row.ConstantItem(16).AlignMiddle().Height(12).Width(12)
                            .Border(1).BorderColor(Colors.Grey.Darken1);
                        row.RelativeItem().PaddingLeft(8).AlignMiddle().Text(step).FontSize(10);
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
            col.Item().PaddingTop(2).PaddingBottom(6).LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
            col.Item().Element(body);
        });
    }

    private static void LabelValue(ColumnDescriptor col, string label, string value)
    {
        col.Item().PaddingBottom(3).Row(row =>
        {
            row.ConstantItem(110).Text(label).FontSize(9).FontColor(Colors.Grey.Darken1);
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
    /// Returns a safe, display-only label for an uploaded design: the final URL segment
    /// (the filename) only — never a domain or local filesystem path. Stored URLs are
    /// root-relative (e.g. "/uploads/designs/abc.png"), so the tail is the filename.
    /// </summary>
    private static string DesignFileLabel(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return "No design uploaded";

        var tail = url.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
        if (string.IsNullOrWhiteSpace(tail))
            tail = url.TrimStart('/');

        try { tail = Uri.UnescapeDataString(tail); } catch { /* keep raw tail */ }
        return string.IsNullOrWhiteSpace(tail) ? "Uploaded design" : tail;
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
