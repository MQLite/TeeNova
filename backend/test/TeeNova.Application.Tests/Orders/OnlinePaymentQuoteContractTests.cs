using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TeeNova.Orders.Dtos;
using TeeNova.Payments;
using TeeNova.Payments.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Boundary contract of the Phase 3 payment endpoints: the browser may submit a provider selection, a
/// purpose hint and a quote fingerprint — never money — and both quote routes inherit the existing public
/// checkout protections.
/// </summary>
public sealed class OnlinePaymentQuoteContractTests
{
    private static readonly string[] MonetaryFieldFragments =
    {
        "Amount", "Price", "Total", "Subtotal", "Surcharge", "Fee", "Cents",
        "BasisPoints", "Mode", "CalculationVersion",
    };

    // ── Session creation request ──────────────────────────────────────────────

    [Fact]
    public void Session_creation_accepts_no_monetary_or_configuration_field()
    {
        var writable = WritableProperties(typeof(CreateOnlinePaymentSessionDto));

        Assert.Equal(
            new[] { "PaymentQuoteFingerprint", "Provider", "Purpose" },
            writable.Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray());

        AssertNoMonetaryFields(writable);
    }

    [Fact]
    public void The_quote_fingerprint_is_an_optional_string()
    {
        var property = typeof(CreateOnlinePaymentSessionDto)
            .GetProperty(nameof(CreateOnlinePaymentSessionDto.PaymentQuoteFingerprint))!;

        Assert.Equal(typeof(string), property.PropertyType);
        Assert.Empty(property.GetCustomAttributes<RequiredAttribute>());
    }

    // ── Quote requests ────────────────────────────────────────────────────────

    [Fact]
    public void Existing_order_quote_request_accepts_no_monetary_field()
        => AssertNoMonetaryFields(WritableProperties(typeof(CreateOnlinePaymentQuoteDto)));

    [Fact]
    public void Draft_quote_request_accepts_no_monetary_field()
    {
        AssertNoMonetaryFields(WritableProperties(typeof(CreateDraftOnlinePaymentQuoteDto)));

        // …and neither do the item lines it carries (they are the same price-free order item DTOs).
        AssertNoMonetaryFields(WritableProperties(typeof(CreateOrderItemDto)));
        AssertNoMonetaryFields(WritableProperties(typeof(CreateOrderItemPrintDto)));
    }

    [Fact]
    public void Draft_quote_request_requires_items_and_caps_their_count()
    {
        var items = typeof(CreateDraftOnlinePaymentQuoteDto)
            .GetProperty(nameof(CreateDraftOnlinePaymentQuoteDto.Items))!;

        Assert.NotEmpty(items.GetCustomAttributes<RequiredAttribute>());
        Assert.Equal(1,  items.GetCustomAttribute<MinLengthAttribute>()!.Length);
        Assert.Equal(50, items.GetCustomAttribute<MaxLengthAttribute>()!.Length);
        Assert.Equal(OrderLimits.MaxDraftQuoteItems, items.GetCustomAttribute<MaxLengthAttribute>()!.Length);
    }

    [Fact]
    public void Draft_quote_request_does_not_demand_customer_pii()
    {
        var names = WritableProperties(typeof(CreateDraftOnlinePaymentQuoteDto)).Select(p => p.Name).ToArray();

        Assert.DoesNotContain("CustomerEmail",   names);
        Assert.DoesNotContain("ShippingAddress", names);
    }

    // ── Safe quote response ───────────────────────────────────────────────────

    [Fact]
    public void The_quote_response_exposes_no_secret_or_internal_state()
    {
        var names = typeof(OnlinePaymentQuoteDto).GetProperties().Select(p => p.Name).ToArray();

        foreach (var forbidden in new[]
                 { "Secret", "Cipher", "Key", "Passphrase", "Encrypt", "Mode", "Concurrency", "Setting" })
        {
            Assert.DoesNotContain(names, n => n.Contains(forbidden, StringComparison.OrdinalIgnoreCase));
        }
    }

    // ── HTTP surface ──────────────────────────────────────────────────────────

    [Theory]
    [InlineData(nameof(OrderController.GetOnlinePaymentQuoteAsync), 32 * 1024)]
    [InlineData(nameof(OrderController.GetDraftOnlinePaymentQuoteAsync), 512 * 1024)]
    public void Quote_routes_reuse_the_public_checkout_protections(string methodName, int expectedSizeLimit)
    {
        var method = typeof(OrderController).GetMethod(methodName)!;

        Assert.NotEmpty(method.GetCustomAttributes<AllowAnonymousAttribute>());
        Assert.Equal("PublicCheckoutPolicy", method.GetCustomAttribute<EnableRateLimitingAttribute>()!.PolicyName);
        // The configured byte cap is only exposed through the attribute's constructor argument.
        var sizeLimitArgument = method
            .GetCustomAttributesData()
            .Single(a => a.AttributeType == typeof(RequestSizeLimitAttribute))
            .ConstructorArguments
            .Single();

        Assert.Equal((long)expectedSizeLimit, Convert.ToInt64(sizeLimitArgument.Value));
        Assert.NotEmpty(method.GetCustomAttributes<HttpPostAttribute>());
    }

    [Fact]
    public void Quote_routes_sit_under_the_existing_order_payment_boundary()
    {
        Assert.Equal(
            "{id:guid}/online-payment-quote",
            typeof(OrderController).GetMethod(nameof(OrderController.GetOnlinePaymentQuoteAsync))!
                .GetCustomAttribute<HttpPostAttribute>()!.Template);

        Assert.Equal(
            "online-payment-quote",
            typeof(OrderController).GetMethod(nameof(OrderController.GetDraftOnlinePaymentQuoteAsync))!
                .GetCustomAttribute<HttpPostAttribute>()!.Template);
    }

    [Fact]
    public void Quote_endpoints_return_only_the_safe_quote_projection()
    {
        foreach (var name in new[]
                 {
                     nameof(OrderController.GetOnlinePaymentQuoteAsync),
                     nameof(OrderController.GetDraftOnlinePaymentQuoteAsync),
                 })
        {
            Assert.Equal(
                typeof(Task<OnlinePaymentQuoteDto>),
                typeof(OrderController).GetMethod(name)!.ReturnType);
        }
    }

    [Fact]
    public void Quote_endpoints_are_declared_on_the_application_contract()
    {
        Assert.NotNull(typeof(IOrderAppService)
            .GetMethod(nameof(IOrderAppService.GetOnlinePaymentQuoteAsync)));
        Assert.NotNull(typeof(IOrderAppService)
            .GetMethod(nameof(IOrderAppService.GetDraftOnlinePaymentQuoteAsync)));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static IReadOnlyList<PropertyInfo> WritableProperties(Type type)
        => type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.GetSetMethod() != null)
            .ToList();

    private static void AssertNoMonetaryFields(IEnumerable<PropertyInfo> properties)
    {
        foreach (var property in properties)
        {
            Assert.DoesNotContain(
                MonetaryFieldFragments,
                fragment => property.Name.Contains(fragment, StringComparison.OrdinalIgnoreCase));

            Assert.NotEqual(typeof(decimal),  property.PropertyType);
            Assert.NotEqual(typeof(decimal?), property.PropertyType);
        }
    }
}
