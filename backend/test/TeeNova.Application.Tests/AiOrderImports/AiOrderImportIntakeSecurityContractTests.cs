using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TeeNova.Auth;
using Volo.Abp.Application.Services;

namespace TeeNova.AiOrderImports.Tests;

public class AiOrderImportIntakeSecurityContractTests
{
    [Fact]
    public void Controller_and_application_service_require_Admin()
    {
        AssertAdminOnly(typeof(AiOrderImportsController));
        AssertAdminOnly(typeof(AiOrderImportIntakeAppService));
        Assert.True(typeof(IApplicationService).IsAssignableFrom(
            typeof(AiOrderImportIntakeAppService)));
        Assert.DoesNotContain(
            typeof(AiOrderImportsController).GetMethods(),
            method => method.GetCustomAttribute<AllowAnonymousAttribute>() is not null);
        Assert.DoesNotContain(
            typeof(AiOrderImportIntakeAppService).GetMethods(),
            method => method.GetCustomAttribute<AllowAnonymousAttribute>() is not null);
    }

    [Fact]
    public void Create_upload_and_content_have_distinct_named_rate_limits()
    {
        AssertRatePolicy(nameof(AiOrderImportsController.CreateAsync),
            AiOrderImportRateLimitPolicies.Create);
        AssertRatePolicy(nameof(AiOrderImportsController.UploadAsync),
            AiOrderImportRateLimitPolicies.Upload);
        AssertRatePolicy(nameof(AiOrderImportsController.GetContentAsync),
            AiOrderImportRateLimitPolicies.Content);
    }

    [Fact]
    public void Content_route_accepts_identifiers_only_and_never_an_object_key()
    {
        var method = typeof(AiOrderImportsController)
            .GetMethod(nameof(AiOrderImportsController.GetContentAsync))!;
        var parameters = method.GetParameters();

        Assert.Equal(
            new[] { "id", "documentId", "cancellationToken" },
            parameters.Select(parameter => parameter.Name!).ToArray());
        Assert.DoesNotContain(
            parameters,
            parameter => parameter.Name!.Contains("key", StringComparison.OrdinalIgnoreCase) ||
                         parameter.Name.Contains("path", StringComparison.OrdinalIgnoreCase));

        var route = method.GetCustomAttribute<HttpGetAttribute>()!.Template!;
        Assert.Contains("{id:guid}", route, StringComparison.Ordinal);
        Assert.Contains("{documentId:guid}", route, StringComparison.Ordinal);
        Assert.DoesNotContain("key", route, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("path", route, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Intake_service_has_no_forbidden_side_effect_dependency()
    {
        var dependencies = typeof(AiOrderImportIntakeAppService)
            .GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Single()
            .GetParameters()
            .Select(parameter => parameter.ParameterType.FullName ?? string.Empty)
            .ToArray();

        foreach (var forbidden in new[]
                 {
                     "OpenAI", "Anthropic", "AiProvider", "OrderAppService", "OrderRepository",
                     "Product", "Catalog", "Payment", "Email", "Inventory", "Production",
                     "PdfService", "FileStorageService",
                 })
        {
            Assert.DoesNotContain(
                dependencies,
                dependency => dependency.Contains(forbidden, StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public void Browser_dtos_do_not_expose_private_storage_or_processing_fields()
    {
        var dtoTypes = typeof(AiOrderImportsController).Assembly
            .GetTypes()
            .Where(type => type.Namespace == "TeeNova.AiOrderImports.Dtos")
            .ToArray();

        foreach (var property in dtoTypes.SelectMany(type => type.GetProperties()))
        {
            Assert.DoesNotContain("PrivateObject", property.Name, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("PhysicalPath", property.Name, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Sha256", property.Name, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Lease", property.Name, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("CanonicalJson", property.Name, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static void AssertAdminOnly(Type type)
    {
        var authorize = type.GetCustomAttribute<AuthorizeAttribute>();
        Assert.NotNull(authorize);
        Assert.Equal(TeeNovaRoles.Admin, authorize.Roles);
    }

    private static void AssertRatePolicy(string methodName, string policyName)
    {
        var method = typeof(AiOrderImportsController).GetMethod(methodName)!;
        var rateLimit = method.GetCustomAttribute<EnableRateLimitingAttribute>();
        Assert.NotNull(rateLimit);
        Assert.Equal(policyName, rateLimit.PolicyName);
    }
}
