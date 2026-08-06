using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TeeNova.Auth;

namespace TeeNova.Enquiries;

public sealed class QuoteRequestControllerContractTests
{
    [Fact]
    public void Application_service_is_proxyable() => Assert.False(typeof(QuoteRequestAppService).IsSealed);

    [Theory]
    [InlineData(nameof(QuoteRequestController.StageAttachmentAsync), "PublicQuoteUploadPolicy")]
    [InlineData(nameof(QuoteRequestController.CreateAsync), "PublicQuotePolicy")]
    public void Public_writes_are_anonymous_and_rate_limited(string methodName, string policy)
    {
        var method = typeof(QuoteRequestController).GetMethod(methodName)!;
        Assert.Single(method.GetCustomAttributes(typeof(AllowAnonymousAttribute), true));
        Assert.Equal(policy, Assert.Single(method.GetCustomAttributes(typeof(EnableRateLimitingAttribute), true).Cast<EnableRateLimitingAttribute>()).PolicyName);
    }

    [Theory]
    [InlineData(nameof(QuoteRequestController.MarkReviewedAsync))]
    [InlineData(nameof(QuoteRequestController.CancelAsync))]
    [InlineData(nameof(QuoteRequestController.MarkSpamAsync))]
    [InlineData(nameof(QuoteRequestController.ResendNotificationAsync))]
    [InlineData(nameof(QuoteRequestController.GetAttachmentContentAsync))]
    public void Mutations_and_attachment_bytes_require_admin(string methodName)
    {
        var auth = Assert.Single(typeof(QuoteRequestController).GetMethod(methodName)!
            .GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.Equal(TeeNovaRoles.Admin, auth.Roles);
    }

    [Theory]
    [InlineData(nameof(QuoteRequestController.GetListAsync))]
    [InlineData(nameof(QuoteRequestController.GetAsync))]
    public void Reads_inherit_authenticated_admin_or_viewer_boundary(string methodName)
    {
        Assert.Empty(typeof(QuoteRequestController).GetMethod(methodName)!
            .GetCustomAttributes(typeof(AllowAnonymousAttribute), true));
        var auth = Assert.Single(typeof(QuoteRequestController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.Equal($"{TeeNovaRoles.Admin},{TeeNovaRoles.Viewer}", auth.Roles);
    }

    [Fact]
    public void Controller_exposes_no_convert_to_order_route()
        => Assert.DoesNotContain(typeof(QuoteRequestController).GetMethods(), method =>
            method.Name.Contains("Order", StringComparison.OrdinalIgnoreCase) ||
            method.Name.Contains("Payment", StringComparison.OrdinalIgnoreCase));

    [Fact]
    public void Public_request_sizes_are_bounded()
    {
        static long Limit(string name) => Convert.ToInt64(typeof(QuoteRequestController).GetMethod(name)!
            .GetCustomAttributesData().Single(x => x.AttributeType == typeof(RequestSizeLimitAttribute))
            .ConstructorArguments.Single().Value);
        Assert.InRange(Limit(nameof(QuoteRequestController.StageAttachmentAsync)), 20L * 1024 * 1024, 21L * 1024 * 1024);
        Assert.Equal(256 * 1024, Limit(nameof(QuoteRequestController.CreateAsync)));
    }
}
