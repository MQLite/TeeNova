using System;
using System.Globalization;
using System.Net;
using System.Text;
using TeeNova.Orders;

namespace TeeNova.Email;

/// <summary>
/// Builds plain HTML and text email bodies for order notification events.
/// All user-supplied strings are HTML-encoded before insertion.
/// Neither template includes UploadedAssetUrl, AdminNotes, or file attachments.
/// </summary>
public static class OrderEmailTemplates
{
    private static readonly CultureInfo DisplayCulture = CultureInfo.GetCultureInfo("en-US");

    // ── Public entry points ───────────────────────────────────────────────────

    public static (string Subject, string HtmlBody, string TextBody)
        BuildCustomerOrderConfirmation(Order order, EmailSettingsSnapshot settings)
    {
        var subject = $"Order Confirmed — {order.OrderNumber}";

        var html = new StringBuilder();
        AppendHtmlHeader(html, "Thank you for your order!");
        AppendHtmlSection(html, "Order Details", BuildOrderDetailRows(order));
        AppendHtmlItemsSection(html, order, includeDesignNotes: true);
        AppendHtmlTotalRow(html, order.TotalAmount);
        AppendHtmlNextSteps(html);
        AppendHtmlContactFooter(html, settings.ShopContactInfo);
        AppendHtmlClose(html);

        var text = BuildCustomerText(order, settings);

        return (subject, html.ToString(), text);
    }

    public static (string Subject, string HtmlBody, string TextBody)
        BuildAdminNewOrderNotification(Order order, EmailSettingsSnapshot settings)
    {
        var subject = $"New Order {order.OrderNumber} — {order.CustomerName}";
        var adminLink = string.IsNullOrWhiteSpace(settings.AdminOrderBaseUrl)
            ? string.Empty
            : $"{settings.AdminOrderBaseUrl.TrimEnd('/')}/{order.Id}";

        var html = new StringBuilder();
        AppendHtmlHeader(html, "New Order Received");
        AppendHtmlSection(html, "Customer", BuildCustomerInfoRows(order));
        AppendHtmlSection(html, "Order Details", BuildOrderDetailRows(order));
        AppendHtmlItemsSection(html, order, includeDesignNotes: true);
        AppendHtmlTotalRow(html, order.TotalAmount);
        if (!string.IsNullOrWhiteSpace(adminLink))
            AppendHtmlAdminLink(html, adminLink);
        AppendHtmlClose(html);

        var text = BuildAdminText(order, adminLink);

        return (subject, html.ToString(), text);
    }

    /// <summary>
    /// Status-update email sent when the order is marked Ready.
    /// Does NOT access order.Items — scalar Order fields only.
    /// </summary>
    public static (string Subject, string HtmlBody, string TextBody)
        BuildOrderReadyEmail(Order order, EmailSettingsSnapshot settings)
    {
        var subject = $"Your order is ready — {order.OrderNumber}";

        var html = new StringBuilder();
        AppendHtmlHeader(html, "Your Order Is Ready");
        AppendHtmlSection(html, "Order Summary", BuildStatusEmailSummaryRows(order));
        AppendHtmlStatusMessage(html, BuildReadyStatusMessage(
            order.DeliveryMethod, settings.ReadyPickupMessage, settings.ReadyShippingMessage));
        AppendHtmlContactFooter(html, settings.ShopContactInfo);
        AppendHtmlClose(html);

        var text = BuildReadyText(order, settings);

        return (subject, html.ToString(), text);
    }

    /// <summary>
    /// Status-update email sent when the order is marked Completed.
    /// Does NOT access order.Items — scalar Order fields only.
    /// </summary>
    public static (string Subject, string HtmlBody, string TextBody)
        BuildOrderCompletedEmail(Order order, EmailSettingsSnapshot settings)
    {
        var subject = $"Your order is complete — {order.OrderNumber}";

        var html = new StringBuilder();
        AppendHtmlHeader(html, "Order Complete");
        AppendHtmlSection(html, "Order Summary", BuildStatusEmailSummaryRows(order));
        AppendHtmlStatusMessage(html, settings.CompletedMessage);
        AppendHtmlContactFooter(html, settings.ShopContactInfo);
        AppendHtmlClose(html);

        var text = BuildCompletedText(order, settings);

        return (subject, html.ToString(), text);
    }

    // ── HTML helpers ──────────────────────────────────────────────────────────

    private static void AppendHtmlHeader(StringBuilder sb, string heading)
    {
        sb.Append("""
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="font-family:Arial,sans-serif;font-size:14px;color:#333;margin:0;padding:20px;background:#f4f4f4;">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;">
              <tr><td style="background:#2c3e50;padding:24px;text-align:center;">
                <span style="color:#fff;font-size:20px;font-weight:bold;">Otahuhu Printing Shop</span>
              </td></tr>
              <tr><td style="padding:24px;">
            """);
        sb.Append($"<h2 style=\"margin-top:0;color:#2c3e50;\">{WebUtility.HtmlEncode(heading)}</h2>");
    }

    private static void AppendHtmlSection(StringBuilder sb, string title, string rows)
    {
        sb.Append($"""
            <h3 style="color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;">{WebUtility.HtmlEncode(title)}</h3>
            <table width="100%" cellpadding="6" cellspacing="0" style="font-size:13px;">
            {rows}
            </table>
            """);
    }

    private static string BuildOrderDetailRows(Order order)
    {
        var sb = new StringBuilder();
        HtmlRow(sb, "Order Number", order.OrderNumber);
        HtmlRow(sb, "Order Date", FormatDate(order.CreationTime));
        HtmlRow(sb, "Delivery Method", FormatDeliveryMethod(order.DeliveryMethod));
        if (!string.IsNullOrWhiteSpace(order.Notes))
            HtmlRow(sb, "Your Notes", order.Notes);
        return sb.ToString();
    }

    private static string BuildCustomerInfoRows(Order order)
    {
        var sb = new StringBuilder();
        HtmlRow(sb, "Name", order.CustomerName);
        HtmlRow(sb, "Email", order.CustomerEmail);
        if (!string.IsNullOrWhiteSpace(order.ShippingAddress?.Phone))
            HtmlRow(sb, "Phone", order.ShippingAddress.Phone);
        return sb.ToString();
    }

    private static void AppendHtmlItemsSection(
        StringBuilder sb, Order order, bool includeDesignNotes)
    {
        sb.Append("<h3 style=\"color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;\">Items</h3>");

        foreach (var item in order.Items)
        {
            sb.Append($"""
                <div style="border:1px solid #ddd;border-radius:4px;padding:12px;margin-bottom:12px;">
                  <strong>{WebUtility.HtmlEncode(item.ProductName)}</strong>
                  &nbsp;—&nbsp;{WebUtility.HtmlEncode(item.VariantLabel)}<br>
                  <span style="color:#666;font-size:12px;">Qty: {item.Quantity} &nbsp;|&nbsp; Unit price: {FormatCurrency(item.UnitPrice)} &nbsp;|&nbsp; Line total: {FormatCurrency(item.UnitPrice * item.Quantity)}</span>
                """);

            if (item.Prints.Count > 0)
            {
                sb.Append("<ul style=\"margin:8px 0 0 0;padding-left:20px;font-size:12px;color:#555;\">");
                foreach (var print in item.Prints)
                {
                    sb.Append($"<li><strong>{WebUtility.HtmlEncode(print.PrintAreaName)}</strong> — {WebUtility.HtmlEncode(print.PrintSizeName)}");

                    var hasFile = print.UploadedAssetId.HasValue;
                    sb.Append(hasFile
                        ? " &nbsp;<span style=\"color:#27ae60;\">&#10003; Design file uploaded</span>"
                        : " &nbsp;<span style=\"color:#999;\">No design file provided</span>");

                    if (includeDesignNotes && !string.IsNullOrWhiteSpace(print.DesignNote))
                        sb.Append($"<br><em style=\"color:#777;\">Design note: {WebUtility.HtmlEncode(print.DesignNote)}</em>");

                    sb.Append("</li>");
                }
                sb.Append("</ul>");
            }

            sb.Append("</div>");
        }
    }

    private static void AppendHtmlTotalRow(StringBuilder sb, decimal total)
    {
        sb.Append($"""
            <p style="font-size:16px;font-weight:bold;text-align:right;margin-top:8px;">
              Order Total: {FormatCurrency(total)}
            </p>
            """);
    }

    private static void AppendHtmlNextSteps(StringBuilder sb)
    {
        sb.Append("""
            <div style="background:#eaf4fb;border-left:4px solid #2980b9;padding:12px 16px;margin:16px 0;font-size:13px;">
              Our team will review your order. We will contact you if anything needs clarification and notify you when your order is ready.
            </div>
            """);
    }

    private static void AppendHtmlContactFooter(StringBuilder sb, string contactInfo)
    {
        if (!string.IsNullOrWhiteSpace(contactInfo))
        {
            sb.Append($"""
                <p style="font-size:12px;color:#777;margin-top:16px;">{WebUtility.HtmlEncode(contactInfo)}</p>
                """);
        }

        sb.Append("""
            <p style="font-size:11px;color:#aaa;margin-top:8px;">This is an automated message — please do not reply directly to this email.</p>
            """);
    }

    private static void AppendHtmlAdminLink(StringBuilder sb, string adminLink)
    {
        sb.Append($"""
            <p style="margin-top:16px;">
              <a href="{WebUtility.HtmlEncode(adminLink)}" style="background:#2c3e50;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-size:13px;">
                View Order in Admin
              </a>
            </p>
            """);
    }

    private static void AppendHtmlClose(StringBuilder sb)
    {
        sb.Append("""
              </td></tr>
            </table>
            </body></html>
            """);
    }

    private static void HtmlRow(StringBuilder sb, string label, string? value)
    {
        sb.Append($"""
            <tr>
              <td style="color:#777;width:140px;vertical-align:top;">{WebUtility.HtmlEncode(label)}</td>
              <td>{WebUtility.HtmlEncode(value ?? string.Empty)}</td>
            </tr>
            """);
    }

    // ── Plain text helpers ────────────────────────────────────────────────────

    private static string BuildCustomerText(Order order, EmailSettingsSnapshot settings)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Otahuhu Printing Shop — Order Confirmed");
        sb.AppendLine(new string('-', 40));
        sb.AppendLine($"Order Number : {order.OrderNumber}");
        sb.AppendLine($"Order Date   : {FormatDate(order.CreationTime)}");
        sb.AppendLine($"Delivery     : {FormatDeliveryMethod(order.DeliveryMethod)}");
        if (!string.IsNullOrWhiteSpace(order.Notes))
            sb.AppendLine($"Your Notes   : {order.Notes}");
        sb.AppendLine();
        sb.AppendLine("ITEMS");
        sb.AppendLine(new string('-', 40));
        AppendTextItems(sb, order);
        sb.AppendLine();
        sb.AppendLine($"Order Total: {FormatCurrency(order.TotalAmount)}");
        sb.AppendLine();
        sb.AppendLine("Our team will review your order and contact you if anything needs clarification.");
        sb.AppendLine("We will notify you when your order is ready.");
        if (!string.IsNullOrWhiteSpace(settings.ShopContactInfo))
        {
            sb.AppendLine();
            sb.AppendLine(settings.ShopContactInfo);
        }
        return sb.ToString();
    }

    private static string BuildAdminText(Order order, string adminLink)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"New Order: {order.OrderNumber}");
        sb.AppendLine(new string('-', 40));
        sb.AppendLine("CUSTOMER");
        sb.AppendLine($"  Name  : {order.CustomerName}");
        sb.AppendLine($"  Email : {order.CustomerEmail}");
        if (!string.IsNullOrWhiteSpace(order.ShippingAddress?.Phone))
            sb.AppendLine($"  Phone : {order.ShippingAddress.Phone}");
        sb.AppendLine();
        sb.AppendLine("ORDER DETAILS");
        sb.AppendLine($"  Date     : {FormatDate(order.CreationTime)}");
        sb.AppendLine($"  Delivery : {FormatDeliveryMethod(order.DeliveryMethod)}");
        sb.AppendLine($"  Total    : {FormatCurrency(order.TotalAmount)}");
        if (!string.IsNullOrWhiteSpace(order.Notes))
            sb.AppendLine($"  Notes    : {order.Notes}");
        sb.AppendLine();
        sb.AppendLine("ITEMS");
        sb.AppendLine(new string('-', 40));
        AppendTextItems(sb, order);
        if (!string.IsNullOrWhiteSpace(adminLink))
        {
            sb.AppendLine();
            sb.AppendLine($"Admin Order Link: {adminLink}");
        }
        return sb.ToString();
    }

    private static void AppendTextItems(StringBuilder sb, Order order)
    {
        foreach (var item in order.Items)
        {
            sb.AppendLine($"  {item.ProductName} ({item.VariantLabel}) x{item.Quantity} @ {FormatCurrency(item.UnitPrice)}");
            foreach (var print in item.Prints)
            {
                var fileStatus = print.UploadedAssetId.HasValue ? "Design file uploaded" : "No design file";
                sb.AppendLine($"    - {print.PrintAreaName} / {print.PrintSizeName} [{fileStatus}]");
                if (!string.IsNullOrWhiteSpace(print.DesignNote))
                    sb.AppendLine($"      Design note: {print.DesignNote}");
            }
        }
    }

    // ── Status-email helpers (Ready / Completed — no Items access) ───────────

    /// <summary>Summary rows for status-update emails. Scalar Order fields only.</summary>
    private static string BuildStatusEmailSummaryRows(Order order)
    {
        var sb = new StringBuilder();
        HtmlRow(sb, "Customer", order.CustomerName);
        HtmlRow(sb, "Order Number", order.OrderNumber);
        HtmlRow(sb, "Order Date", FormatDate(order.CreationTime));
        HtmlRow(sb, "Order Total", FormatCurrency(order.TotalAmount));
        HtmlRow(sb, "Delivery", FormatDeliveryMethod(order.DeliveryMethod));
        if (!string.IsNullOrWhiteSpace(order.Notes))
            HtmlRow(sb, "Your Notes", order.Notes);
        return sb.ToString();
    }

    private static string BuildReadyStatusMessage(
        DeliveryMethod? method, string pickupMsg, string shippingMsg) => method switch
    {
        Orders.DeliveryMethod.Pickup   => pickupMsg,
        Orders.DeliveryMethod.Shipping => shippingMsg,
        _                              => pickupMsg,
    };

    private static void AppendHtmlStatusMessage(StringBuilder sb, string message)
    {
        sb.Append($"""
            <div style="background:#eaf4fb;border-left:4px solid #2980b9;padding:12px 16px;margin:16px 0;font-size:13px;">
              {WebUtility.HtmlEncode(message)}
            </div>
            """);
    }

    private static string BuildReadyText(Order order, EmailSettingsSnapshot settings)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Otahuhu Printing Shop — Your order is ready — {order.OrderNumber}");
        sb.AppendLine(new string('-', 40));
        sb.AppendLine($"Customer     : {order.CustomerName}");
        sb.AppendLine($"Order Number : {order.OrderNumber}");
        sb.AppendLine($"Order Date   : {FormatDate(order.CreationTime)}");
        sb.AppendLine($"Order Total  : {FormatCurrency(order.TotalAmount)}");
        sb.AppendLine($"Delivery     : {FormatDeliveryMethod(order.DeliveryMethod)}");
        if (!string.IsNullOrWhiteSpace(order.Notes))
            sb.AppendLine($"Your Notes   : {order.Notes}");
        sb.AppendLine();
        sb.AppendLine(BuildReadyStatusMessage(
            order.DeliveryMethod, settings.ReadyPickupMessage, settings.ReadyShippingMessage));
        if (!string.IsNullOrWhiteSpace(settings.ShopContactInfo))
        {
            sb.AppendLine();
            sb.AppendLine(settings.ShopContactInfo);
        }
        return sb.ToString();
    }

    private static string BuildCompletedText(Order order, EmailSettingsSnapshot settings)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Otahuhu Printing Shop — Your order is complete — {order.OrderNumber}");
        sb.AppendLine(new string('-', 40));
        sb.AppendLine($"Customer     : {order.CustomerName}");
        sb.AppendLine($"Order Number : {order.OrderNumber}");
        sb.AppendLine($"Order Date   : {FormatDate(order.CreationTime)}");
        sb.AppendLine($"Order Total  : {FormatCurrency(order.TotalAmount)}");
        if (!string.IsNullOrWhiteSpace(order.Notes))
            sb.AppendLine($"Your Notes   : {order.Notes}");
        sb.AppendLine();
        sb.AppendLine(settings.CompletedMessage);
        if (!string.IsNullOrWhiteSpace(settings.ShopContactInfo))
        {
            sb.AppendLine();
            sb.AppendLine(settings.ShopContactInfo);
        }
        return sb.ToString();
    }

    // ── Format helpers ────────────────────────────────────────────────────────

    private static string FormatCurrency(decimal amount)
        => amount.ToString("C2", DisplayCulture);

    private static string FormatDate(DateTime dt)
        => dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string FormatDeliveryMethod(DeliveryMethod? method) => method switch
    {
        Orders.DeliveryMethod.Pickup   => "Pickup",
        Orders.DeliveryMethod.Shipping => "Shipping",
        null                           => "Not specified",
        _                              => method.ToString()!,
    };
}
