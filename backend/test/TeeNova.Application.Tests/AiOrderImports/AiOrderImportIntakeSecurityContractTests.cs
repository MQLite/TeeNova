using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TeeNova.Auth;
using Volo.Abp.Application.Services;
using Volo.Abp.Validation;

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
    public void Stream_taking_service_methods_opt_out_of_DataAnnotations_argument_validation()
    {
        // ABP's validation interceptor reads every property of each non-primitive argument.
        // On a Stream that hits ReadTimeout, which throws on request streams and fails the
        // upload before a byte is read. Any new Stream-taking method needs the same opt-out.
        var streamMethods = typeof(AiOrderImportIntakeAppService)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(method => method.GetParameters()
                .Any(parameter => typeof(Stream).IsAssignableFrom(parameter.ParameterType)))
            .ToArray();

        Assert.NotEmpty(streamMethods);
        Assert.All(streamMethods, method =>
            Assert.NotNull(method.GetCustomAttribute<DisableValidationAttribute>()));
    }

    [Fact]
    public async Task Upload_argument_validation_does_not_touch_the_request_stream()
    {
        // Without the opt-out this throws "Property accessor 'ReadTimeout' ... Timeouts are
        // not supported on this stream", failing every upload before a byte is read.
        var contributorType = typeof(ObjectValidator).Assembly
            .GetTypes()
            .First(type => type.Name.Contains("DataAnnotation") &&
                           !type.IsInterface &&
                           !type.IsAbstract);
        var services = new ServiceCollection();
        services.AddTransient(contributorType);
        var options = Options.Create(new AbpValidationOptions
        {
            ObjectValidationContributors = { contributorType },
        });
        services.AddSingleton<IOptions<AbpValidationOptions>>(options);
        await using var provider = services.BuildServiceProvider();
        var validator = new MethodInvocationValidator(new ObjectValidator(
            options,
            provider.GetRequiredService<IServiceScopeFactory>()));

        var context = new MethodInvocationValidationContext(
            typeof(AiOrderImportIntakeAppService),
            typeof(AiOrderImportIntakeAppService).GetMethod(
                nameof(AiOrderImportIntakeAppService.UploadAsync))!,
            [
                Guid.NewGuid(),
                "upload-key",
                AiOrderCaptureMethod.Upload,
                new MemoryStream([1, 2, 3]),
                "order.jpg",
                "image/jpeg",
                3L,
                CancellationToken.None,
            ]);

        Assert.Null(await Record.ExceptionAsync(() => validator.ValidateAsync(context)));
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
