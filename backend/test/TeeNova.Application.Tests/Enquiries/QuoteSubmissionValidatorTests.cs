using TeeNova.Enquiries.Dtos;
using Volo.Abp;

namespace TeeNova.Enquiries;

public sealed class QuoteSubmissionValidatorTests
{
    private static readonly DateTime Now = new(2026, 8, 5, 12, 0, 0, DateTimeKind.Utc);
    private readonly QuoteSubmissionValidator _validator = new();

    [Theory]
    [InlineData(QuoteServiceType.GarmentPrinting)]
    [InlineData(QuoteServiceType.BringYourOwnGarment)]
    [InlineData(QuoteServiceType.Badges)]
    [InlineData(QuoteServiceType.BusinessCards)]
    [InlineData(QuoteServiceType.StickersLabels)]
    public void Accepts_non_dimensioned_services(QuoteServiceType service)
    {
        var result = _validator.ValidateAndNormalize(Valid(service), Now);
        Assert.Equal(service, result.ServiceType);
    }

    [Theory]
    [InlineData(QuoteServiceType.Banners)]
    [InlineData(QuoteServiceType.Signage)]
    public void Dimensioned_services_require_both_values_and_unit(QuoteServiceType service)
    {
        var input = Valid(service); input.Width = null;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
        input.Width = 100; input.Height = null;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
        input.Height = 200; input.DimensionUnit = null;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
    }

    [Fact]
    public void Other_requires_an_explanation_but_not_quantity()
    {
        var input = Valid(QuoteServiceType.Other); input.Quantity = null; input.ServiceTypeOther = "  Foil job  ";
        var result = _validator.ValidateAndNormalize(input, Now);
        Assert.Equal("Foil job", result.ServiceTypeOther);
        input.ServiceTypeOther = " ";
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1000001)]
    public void Rejects_unsafe_quantity_bounds(int quantity)
    {
        var input = Valid(); input.Quantity = quantity;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
    }

    [Theory]
    [InlineData("customer@example.com", "customer@example.com")]
    [InlineData(" Customer@Example.COM ", "customer@example.com")]
    public void Normalizes_email(string value, string expected)
    {
        var input = Valid(); input.CustomerEmail = value;
        Assert.Equal(expected, _validator.ValidateAndNormalize(input, Now).CustomerEmail);
    }

    [Theory]
    [InlineData("")]
    [InlineData("missing-at.example.com")]
    [InlineData("@example.com")]
    public void Rejects_invalid_email(string value)
    {
        var input = Valid(); input.CustomerEmail = value;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
    }

    [Fact]
    public void Delivery_requires_suburb()
    {
        var input = Valid(); input.FulfilmentPreference = QuoteFulfilmentPreference.Delivery; input.DeliverySuburb = null;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
        input.DeliverySuburb = " Otahuhu ";
        Assert.Equal("Otahuhu", _validator.ValidateAndNormalize(input, Now).DeliverySuburb);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/quote")]
    [InlineData("/contact")]
    [InlineData("/customize")]
    [InlineData("/products")]
    [InlineData("/products/5d2dd857-b185-4b15-a448-9348a5e8be33")]
    [InlineData("/services/banners?campaign=home")]
    public void Accepts_allowlisted_internal_source_paths(string source)
    {
        var input = Valid(); input.SourcePath = source;
        Assert.Equal(source, _validator.ValidateAndNormalize(input, Now).SourcePath);
    }

    [Theory]
    [InlineData("https://example.com/")]
    [InlineData("//evil.example/path")]
    [InlineData("/admin/orders")]
    [InlineData("/api/quote-requests")]
    [InlineData("products")]
    [InlineData("/unknown")]
    [InlineData("/products\\..\\admin")]
    public void Rejects_external_or_non_allowlisted_source_paths(string source)
    {
        var input = Valid(); input.SourcePath = source;
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
    }

    [Fact]
    public void Rejects_past_required_date_and_accepts_today()
    {
        var input = Valid(); input.RequiredDate = Now.Date.AddDays(-1);
        AssertCode(() => _validator.ValidateAndNormalize(input, Now), QuoteRequestErrorCodes.InvalidRequest);
        input.RequiredDate = Now.Date;
        Assert.Equal(Now.Date, _validator.ValidateAndNormalize(input, Now).RequiredDate);
    }

    [Fact]
    public void Semantic_hash_is_stable_but_changes_with_material_fields()
    {
        var first = _validator.ValidateAndNormalize(Valid(), Now);
        var same = _validator.ValidateAndNormalize(Valid(), Now);
        Assert.Equal(QuoteSubmissionValidator.ComputeSubmissionHash(first), QuoteSubmissionValidator.ComputeSubmissionHash(same));
        var changedInput = Valid(); changedInput.Quantity = 99;
        var changed = _validator.ValidateAndNormalize(changedInput, Now);
        Assert.NotEqual(QuoteSubmissionValidator.ComputeSubmissionHash(first), QuoteSubmissionValidator.ComputeSubmissionHash(changed));
    }

    [Fact]
    public void Semantic_hash_is_order_independent_but_changes_with_attachment_content()
    {
        var submission = _validator.ValidateAndNormalize(Valid(), Now);
        var first = QuoteSubmissionValidator.ComputeSubmissionHash(submission, ["bbb", "aaa"]);
        Assert.Equal(first, QuoteSubmissionValidator.ComputeSubmissionHash(submission, ["aaa", "bbb"]));
        Assert.NotEqual(first, QuoteSubmissionValidator.ComputeSubmissionHash(submission, ["aaa", "ccc"]));
        Assert.NotEqual(first, QuoteSubmissionValidator.ComputeSubmissionHash(submission));
    }

    [Fact]
    public void Ip_hash_is_keyed_non_reversible_and_optional()
    {
        const string ip = "203.0.113.42";
        var first = QuoteSubmissionValidator.HashClientIp(ip, new string('a', 32));
        Assert.Equal(64, first!.Length);
        Assert.DoesNotContain(ip, first);
        Assert.Equal(first, QuoteSubmissionValidator.HashClientIp(ip, new string('a', 32)));
        Assert.NotEqual(first, QuoteSubmissionValidator.HashClientIp(ip, new string('b', 32)));
        Assert.Null(QuoteSubmissionValidator.HashClientIp(ip, null));
    }

    private static CreateQuoteRequestDto Valid(QuoteServiceType service = QuoteServiceType.GarmentPrinting) => new()
    {
        ServiceType = service, ServiceTypeOther = service == QuoteServiceType.Other ? "Other work" : null,
        Quantity = 10, Width = service is QuoteServiceType.Banners or QuoteServiceType.Signage ? 100 : null,
        Height = service is QuoteServiceType.Banners or QuoteServiceType.Signage ? 200 : null,
        DimensionUnit = service is QuoteServiceType.Banners or QuoteServiceType.Signage ? QuoteDimensionUnit.Millimetres : null,
        FulfilmentPreference = QuoteFulfilmentPreference.NotSure,
        CustomerName = " Customer ", CustomerEmail = "Customer@Example.com", Notes = " Details ",
        SubmissionKey = "1234567890abcdef", SourcePath = "/quote",
    };

    private static void AssertCode(Action action, string code)
        => Assert.Equal(code, Assert.Throws<BusinessException>(action).Code);
}
