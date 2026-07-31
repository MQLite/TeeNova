using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.AiOrderImports.Recognition;
using Volo.Abp.Application.Services;
using Xunit;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderRecognitionSecurityContractTests
{
    [Fact]
    public void Recognition_controller_and_application_service_are_admin_only()
    {
        Assert.NotNull(typeof(AiOrderImportsController).GetCustomAttribute<AuthorizeAttribute>());
        Assert.NotNull(typeof(AiOrderRecognitionAppService).GetCustomAttribute<AuthorizeAttribute>());
        Assert.True(typeof(IApplicationService).IsAssignableFrom(
            typeof(AiOrderRecognitionAppService)));
        Assert.DoesNotContain(
            typeof(AiOrderImportsController).GetMethods(),
            method => method.GetCustomAttribute<AllowAnonymousAttribute>() is not null);
        Assert.DoesNotContain(
            typeof(AiOrderRecognitionAppService).GetMethods(),
            method => method.GetCustomAttribute<AllowAnonymousAttribute>() is not null);
    }

    [Fact]
    public void Recognition_routes_are_identifier_based_and_use_server_side_selection()
    {
        var controller = typeof(AiOrderImportsController);
        Assert.Equal(
            "recognition-options",
            controller.GetMethod(nameof(AiOrderImportsController.GetRecognitionOptionsAsync))!
                .GetCustomAttribute<HttpGetAttribute>()!.Template);
        Assert.Equal(
            "{id:guid}/recognition",
            controller.GetMethod(nameof(AiOrderImportsController.StartRecognitionAsync))!
                .GetCustomAttribute<HttpPostAttribute>()!.Template);
        Assert.Equal(
            "{id:guid}/recognition/retry",
            controller.GetMethod(nameof(AiOrderImportsController.RetryRecognitionAsync))!
                .GetCustomAttribute<HttpPostAttribute>()!.Template);
    }

    [Fact]
    public void Recognition_processor_has_no_downstream_side_effect_dependencies()
    {
        var dependencies = typeof(AiOrderRecognitionProcessor)
            .GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Single()
            .GetParameters()
            .Select(parameter => parameter.ParameterType.FullName ?? string.Empty)
            .ToArray();
        foreach (var forbidden in new[]
                 {
                     "OrderService", "OrderItem", "Product", "Catalogue", "Payment",
                     "Email", "Inventory", "Production", "Pdf",
                 })
        {
            Assert.DoesNotContain(
                dependencies,
                dependency => dependency.Contains(forbidden, StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public void Provider_contract_never_receives_entities_repositories_paths_or_object_keys()
    {
        var requestProperties = typeof(AiOrderRecognitionRequest)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();
        Assert.DoesNotContain(requestProperties, name =>
            name.Contains("Path", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("ObjectKey", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Repository", StringComparison.OrdinalIgnoreCase));
        Assert.All(
            typeof(AiOrderRecognitionRequest).GetProperties(),
            property => Assert.DoesNotContain(
                "Entity",
                property.PropertyType.Name,
                StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Normal_status_dto_excludes_secrets_raw_payload_and_private_storage()
    {
        var names = typeof(Dtos.AiOrderRecognitionStatusDto)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();
        foreach (var forbidden in new[]
                 {
                     "ApiKey", "Secret", "Prompt", "Raw", "ObjectKey", "Path", "Url",
                 })
        {
            Assert.DoesNotContain(
                names,
                name => name.Contains(forbidden, StringComparison.OrdinalIgnoreCase));
        }
    }
}
