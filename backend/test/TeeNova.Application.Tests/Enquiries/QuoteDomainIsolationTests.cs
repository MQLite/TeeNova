using TeeNova.Enquiries.Dtos;

namespace TeeNova.Enquiries;

public sealed class QuoteDomainIsolationTests
{
    [Fact]
    public void Retention_anonymization_removes_customer_and_tracking_data()
    {
        var quote = new QuoteRequest(Guid.NewGuid())
        {
            CustomerName = "Customer", CustomerEmail = "customer@example.com", CustomerPhone = "021234567",
            OrganisationName = "Organisation", Notes = "Private notes", DeliverySuburb = "Otahuhu",
            SubmissionHash = new string('a', 64), SubmissionKey = "submission-key-1234",
            SourcePath = "/quote", ClientIpHash = new string('b', 64),
        };
        quote.AnonymizeForRetention();
        Assert.Equal("Deleted", quote.CustomerName);
        Assert.Equal("deleted@invalid.local", quote.CustomerEmail);
        Assert.Null(quote.CustomerPhone);
        Assert.Null(quote.OrganisationName);
        Assert.Null(quote.Notes);
        Assert.Null(quote.DeliverySuburb);
        Assert.Null(quote.SubmissionKey);
        Assert.Null(quote.SourcePath);
        Assert.Null(quote.ClientIpHash);
        Assert.NotEqual(new string('a', 64), quote.SubmissionHash);
    }

    [Theory]
    [InlineData(typeof(QuoteRequest))]
    [InlineData(typeof(QuoteRequestDto))]
    [InlineData(typeof(QuoteRequestResultDto))]
    [InlineData(typeof(QuoteRequestSummaryDto))]
    [InlineData(typeof(CreateQuoteRequestDto))]
    public void Quote_contracts_have_no_authoritative_commerce_fields(Type type)
    {
        var forbidden = new[] { "Price", "Total", "OrderId", "Payment", "Inventory", "Production", "Checkout", "Cart" };
        Assert.DoesNotContain(type.GetProperties(), property => forbidden.Any(value => property.Name.Contains(value, StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public void General_quote_is_a_sibling_not_a_banner_subclass()
    {
        Assert.False(typeof(BannerQuoteRequest).IsAssignableFrom(typeof(QuoteRequest)));
        Assert.False(typeof(QuoteRequest).IsAssignableFrom(typeof(BannerQuoteRequest)));
    }

    [Theory]
    [InlineData(QuoteRequestStatus.New, QuoteRequestStatus.Reviewed, true)]
    [InlineData(QuoteRequestStatus.New, QuoteRequestStatus.Cancelled, true)]
    [InlineData(QuoteRequestStatus.New, QuoteRequestStatus.Spam, true)]
    [InlineData(QuoteRequestStatus.Reviewed, QuoteRequestStatus.Cancelled, true)]
    [InlineData(QuoteRequestStatus.Reviewed, QuoteRequestStatus.Spam, true)]
    [InlineData(QuoteRequestStatus.Cancelled, QuoteRequestStatus.Reviewed, false)]
    public void Lifecycle_contract_is_stable(QuoteRequestStatus from, QuoteRequestStatus to, bool expected)
    {
        var allowed = to switch
        {
            QuoteRequestStatus.Reviewed => from == QuoteRequestStatus.New,
            QuoteRequestStatus.Cancelled or QuoteRequestStatus.Spam => from is QuoteRequestStatus.New or QuoteRequestStatus.Reviewed,
            _ => false,
        };
        Assert.Equal(expected, allowed);
    }
}
