using System;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TeeNova.Pricing.Dtos;

namespace TeeNova.Pricing;

public sealed class PricingBatchContractTests
{
    [Fact]
    public void Batch_is_bounded_and_requires_at_least_one_item()
    {
        var items = typeof(BatchPriceCalculationRequestDto)
            .GetProperty(nameof(BatchPriceCalculationRequestDto.Items))!;

        Assert.Equal(1, items.GetCustomAttribute<MinLengthAttribute>()!.Length);
        Assert.Equal(50, items.GetCustomAttribute<MaxLengthAttribute>()!.Length);
        Assert.NotEmpty(items.GetCustomAttributes<RequiredAttribute>());
    }

    [Fact]
    public void Correlation_key_is_opaque_and_request_contains_the_pricing_authority()
    {
        var properties = typeof(BatchPriceCalculationItemDto)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .OrderBy(property => property.Name, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(new[] { "CorrelationKey", "Request" }, properties.Select(p => p.Name));
        Assert.Equal(typeof(string), properties.Single(p => p.Name == "CorrelationKey").PropertyType);
        Assert.Equal(
            typeof(PriceCalculationRequestDto),
            properties.Single(p => p.Name == "Request").PropertyType);
        Assert.DoesNotContain(properties, p => p.Name.Contains("Price", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(properties, p => p.Name.Contains("CartItem", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Batch_route_preserves_public_pricing_protection_and_has_a_body_cap()
    {
        var method = typeof(PricingController).GetMethod(nameof(PricingController.CalculateBatchAsync))!;

        Assert.NotEmpty(typeof(PricingController).GetCustomAttributes<AllowAnonymousAttribute>());
        Assert.Equal("calculate-batch", method.GetCustomAttribute<HttpPostAttribute>()!.Template);
        Assert.Equal(
            "PublicPricingPolicy",
            method.GetCustomAttribute<EnableRateLimitingAttribute>()!.PolicyName);
        var sizeLimit = method
            .GetCustomAttributesData()
            .Single(attribute => attribute.AttributeType == typeof(RequestSizeLimitAttribute))
            .ConstructorArguments
            .Single();
        Assert.Equal(512L * 1024L, Convert.ToInt64(sizeLimit.Value));
        Assert.Equal(typeof(Task<BatchPriceCalculationResponseDto>), method.ReturnType);
    }

    [Fact]
    public void Existing_single_line_route_is_unchanged()
    {
        var method = typeof(PricingController).GetMethod(nameof(PricingController.CalculateAsync))!;

        Assert.Equal("calculate", method.GetCustomAttribute<HttpPostAttribute>()!.Template);
        Assert.Equal(
            "PublicPricingPolicy",
            method.GetCustomAttribute<EnableRateLimitingAttribute>()!.PolicyName);
        Assert.Equal(typeof(Task<PriceCalculationResponseDto>), method.ReturnType);
    }

    [Fact]
    public void Batch_response_has_one_correlation_and_either_quote_or_safe_error_code()
    {
        var properties = typeof(BatchPriceCalculationResultDto)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(new[] { "CorrelationKey", "ErrorCode", "Quote" }.OrderBy(x => x), properties);
        Assert.Null(typeof(BatchPriceCalculationResultDto).GetProperty("CartItemKey"));
    }
}
