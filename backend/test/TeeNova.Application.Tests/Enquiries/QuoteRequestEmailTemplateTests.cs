using TeeNova.Email;

namespace TeeNova.Enquiries;

public sealed class QuoteRequestEmailTemplateTests
{
    [Fact]
    public void Internal_email_has_reference_admin_link_and_no_commerce_claim()
    {
        var (subject, html, text) = QuoteRequestEmailTemplates.Internal(Request(), Settings());
        Assert.Contains("QR-ABC234", subject);
        Assert.Contains("/admin/quote-requests/", html);
        Assert.Contains("no payment has been taken", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("checkout", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("order confirmed", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Customer_email_is_human_readable_and_does_not_promise_delivery_or_deadline()
    {
        var (_, html, text) = QuoteRequestEmailTemplates.Customer(Request(), Settings());
        Assert.Contains("QR-ABC234", text);
        Assert.Contains("No payment has been taken", text);
        Assert.DoesNotContain("within 24 hours", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("email delivered", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("payment link", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Templates_html_encode_customer_content()
    {
        var request = Request(); request.CustomerName = "<script>alert(1)</script>"; request.Notes = "<img src=x onerror=alert(1)>";
        var (_, html, _) = QuoteRequestEmailTemplates.Customer(request, Settings());
        Assert.DoesNotContain("<script>", html);
        Assert.DoesNotContain("<img src=x", html);
        Assert.Contains("&lt;script&gt;", html);
    }

    [Fact]
    public void Invalid_admin_base_url_is_omitted()
    {
        var settings = Settings(); settings = new() { AdminOrderBaseUrl = "not-a-url" };
        var (_, html, _) = QuoteRequestEmailTemplates.Internal(Request(), settings);
        Assert.DoesNotContain("/admin/quote-requests/", html);
    }

    private static QuoteRequest Request() => new(Guid.NewGuid())
    {
        Reference = "QR-ABC234", ServiceType = QuoteServiceType.Banners, Quantity = 5,
        Width = 1000, Height = 500, DimensionUnit = QuoteDimensionUnit.Millimetres,
        FulfilmentPreference = QuoteFulfilmentPreference.Pickup,
        CustomerName = "Customer", CustomerEmail = "customer@example.com", Notes = "Quote this",
    };
    private static EmailSettingsSnapshot Settings() => new() { AdminOrderBaseUrl = "https://admin.example.test/admin/orders" };
}
