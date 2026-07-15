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
                        columns.RelativeColumn(1.6f);  // clothes finded (check)
                        columns.RelativeColumn(1.4f);  // finished (check)
                    });

                    table.Header(header =>
                    {
                        HeaderCell(header.Cell(), "Product");
                        HeaderCell(header.Cell(), "Variant");
                        HeaderCell(header.Cell(), "Qty", right: true);
                        HeaderCell(header.Cell(), "Clothes Finded", center: true);
                        HeaderCell(header.Cell(), "Finished", center: true);
                    });

                    // Rows follow product name, then the natural garment size sequence (S, M, L, XL…)
                    // rather than cart/insertion order, so a product's sizes read in order on the sheet.
                    // Colour is the final tiebreak for deterministic output. Non-garment items (Badge,
                    // Banner) have no size and sort among themselves by name.
                    var itemsInDisplayOrder = order.Items
                        .Select(i => new { Item = i, Parts = SplitVariantLabel(i.VariantLabel) })
                        .OrderBy(x => x.Item.ProductName, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(x => SizeRank(x.Parts.Size))
                        .ThenBy(x => x.Parts.Size, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(x => x.Parts.Color, StringComparer.OrdinalIgnoreCase)
                        .Select(x => x.Item)
                        .ToList();

                    foreach (var item in itemsInDisplayOrder)
                    {
                        BodyCell(table.Cell()).Text(item.ProductName);
                        BodyCell(table.Cell()).Text(item.VariantLabel ?? "-");
                        BodyCell(table.Cell()).AlignRight().Text(item.Quantity.ToString(CultureInfo.InvariantCulture));
                        CheckBoxCell(table.Cell());
                        CheckBoxCell(table.Cell());
                    }
                });

                // Print production list, grouped by the print instruction itself — design, position
                // (print area) and print size. Every garment that takes that exact print is listed under it,
                // with sizes combined per product + colour (e.g. "Daisy Yellow / S, M, L, XL"). The design is
                // keyed by its core file name (DesignDisplayName strips the per-upload prefix) so the same
                // artwork re-uploaded for each placement still collapses, while the heading shows the design
                // description when one was given. Keeping the file name in the key stops two distinct
                // artworks that happen to share a description from merging. Per-size quantities stay in the
                // Items table above.
                var printRows = order.Items
                    .Where(i => i.Prints.Count > 0)
                    .SelectMany(item =>
                    {
                        var (color, size) = SplitVariantLabel(item.VariantLabel);
                        return item.Prints.Select(p => (
                            item.ProductName,
                            Color: color,
                            Size: size,
                            Design: DesignDisplayName(p.UploadedAssetUrl),
                            DesignLabel: DesignLabel(p.UploadedAssetUrl, p.DesignNote),
                            Area: p.PrintAreaName,
                            PrintSize: p.PrintSizeName,
                            Notes: new[]
                            {
                                string.IsNullOrWhiteSpace(p.Notes) ? null : $"Print note: {p.Notes}",
                            }.Where(n => n is not null).Select(n => n!).ToList()));
                    })
                    .ToList();

                if (printRows.Count > 0)
                    col.Item().PaddingTop(8).Text("Print production").SemiBold().FontSize(10);

                foreach (var group in printRows.GroupBy(r => (r.Design, r.DesignLabel, r.Area, r.PrintSize)))
                {
                    var first = group.First();

                    col.Item().PaddingTop(4).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
                        .PaddingLeft(6).Column(pc =>
                        {
                            pc.Item().Text(t =>
                            {
                                t.Span(first.DesignLabel).SemiBold().FontSize(9);
                                t.Span("  ·  ").FontSize(9).FontColor(Colors.Grey.Medium);
                                t.Span($"{first.Area} · {first.PrintSize}").FontSize(9);
                            });

                            // Each product + colour the print lands on, with its garment sizes combined.
                            foreach (var garment in group.GroupBy(r => (r.ProductName, r.Color)))
                            {
                                var g = garment.First();
                                var sizes = garment.Select(r => r.Size).Where(s => s.Length > 0).Distinct()
                                    .OrderBy(SizeRank).ThenBy(s => s, StringComparer.OrdinalIgnoreCase).ToList();
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

    private void ComposeDesignOnlyItems(ColumnDescriptor col, OrderDto order)
    {
        // Badge (and any future non-garment, non-banner design-only kind). Banner has its own section.
        var designOnly = order.Items
            .Where(i => i.ProductKind != ProductKind.Garment && i.ProductKind != ProductKind.Banner)
            .ToList();
        if (designOnly.Count == 0)
            return;

        col.Item().PaddingTop(8).Text("Badge / design-only items").SemiBold().FontSize(10);

        foreach (var item in designOnly)
        {
            col.Item().PaddingTop(4).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
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
        var banners = order.Items.Where(i => i.ProductKind == ProductKind.Banner).ToList();
        if (banners.Count == 0)
            return;

        col.Item().PaddingTop(8).Text("Banner production details").SemiBold().FontSize(10);

        foreach (var item in banners)
        {
            col.Item().PaddingTop(4).PaddingLeft(8).BorderLeft(2).BorderColor(Colors.Grey.Lighten1)
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

    /// <summary>An empty bordered square in a table cell for staff to tick off on the printed sheet.</summary>
    private static void CheckBoxCell(IContainer container)
        => BodyCell(container).AlignCenter().AlignMiddle()
            .Height(12).Width(12).Border(1).BorderColor(Colors.Grey.Darken1);

    // ── Formatting helpers ──────────────────────────────────────────────────────

    /// <summary>Culture-independent NZD money formatting, e.g. "1,250.00 NZD".</summary>
    private static string FormatMoney(decimal value)
        => $"{value.ToString("N2", CultureInfo.InvariantCulture)} NZD";

    /// <summary>
    /// Splits a "Colour / Size" variant label into its parts. Splits on the last " / " so colours that
    /// contain a slash stay intact; returns an empty size when the label has no separator.
    /// </summary>
    private static (string Color, string Size) SplitVariantLabel(string? variantLabel)
    {
        var label = variantLabel?.Trim() ?? string.Empty;
        var idx = label.LastIndexOf(" / ", StringComparison.Ordinal);
        return idx < 0
            ? (label, string.Empty)
            : (label[..idx].Trim(), label[(idx + 3)..].Trim());
    }

    /// <summary>Canonical apparel size order used to sequence garment rows (index = rank).</summary>
    private static readonly string[] SizeSequence =
        { "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL", "XXXXXXL" };

    private static readonly System.Text.RegularExpressions.Regex NumericXlSize =
        new(@"^(\d+)\s*XL$", System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>
    /// Ranks a garment size for sorting: known apparel sizes in their natural sequence (XS…XXXL),
    /// then purely numeric sizes in numeric order, then any other named size (alphabetical via the
    /// caller's secondary sort), then blank/no-size last. Normalises "2XL"/"3XL" to "XXL"/"XXXL".
    /// </summary>
    private static int SizeRank(string size)
    {
        var s = size.Trim().ToUpperInvariant();
        if (s.Length == 0)
            return int.MaxValue;

        var m = NumericXlSize.Match(s);
        if (m.Success && int.TryParse(m.Groups[1].Value, out var xCount) && xCount >= 2)
            s = new string('X', xCount) + "L";

        var idx = Array.IndexOf(SizeSequence, s);
        if (idx >= 0)
            return idx;

        // Kids/numeric sizes (e.g. "8", "10") after the letter sizes but in numeric order.
        if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric))
            return 10_000 + numeric;

        return int.MaxValue - 1; // unknown named size: before blanks, alphabetised by secondary sort
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
