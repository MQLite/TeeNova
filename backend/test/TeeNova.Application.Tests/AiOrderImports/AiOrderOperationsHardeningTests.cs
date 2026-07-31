using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.AiOrderImports.Dtos;
using TeeNova.AiOrderImports.Operations;
using TeeNova.AiOrderImports.Recognition;

namespace TeeNova.AiOrderImports;

public sealed class AiOrderOperationsHardeningTests
{
    [Fact]
    public void All_capabilities_are_disabled_by_default()
    {
        var options = new AiOrderFeatureOptions();

        Assert.False(options.Enabled);
        Assert.False(options.IntakeEnabled);
        Assert.False(options.RecognitionEnabled);
        Assert.False(options.ReviewEnabled);
        Assert.False(options.ConfirmationEnabled);
        Assert.False(options.MaterializationEnabled);
        Assert.True(options.OperationalStatusVisibleToAdmin);
    }

    [Fact]
    public void Stage_cannot_be_enabled_under_disabled_master_feature()
    {
        var result = new AiOrderOperationalOptionsValidator().Validate(
            null,
            new AiOrderFeatureOptions { IntakeEnabled = true });

        Assert.True(result.Failed);
    }

    [Theory]
    [InlineData("", "Missing Key")]
    [InlineData("secret", "No Enabled Model")]
    public void Provider_readiness_fails_closed_without_key_or_model(
        string apiKey,
        string expected)
    {
        var provider = ReadyProvider();
        provider.ApiKey = apiKey;
        provider.Models.Clear();
        var options = RecognitionWith(provider);

        var result = new AiOrderProviderReadiness()
            .Evaluate(options, EnabledFeatures(), "Staging")
            .Single();

        Assert.Equal(expected, result.Status);
        Assert.DoesNotContain("secret", JsonSerializer.Serialize(result));
    }

    [Fact]
    public void Sanitized_approval_is_not_valid_for_production_customer_data()
    {
        var provider = ReadyProvider();
        provider.PrivacyApprovalStatus = "ApprovedForSanitizedTesting";
        provider.ApprovedEnvironment = "Production";
        var result = new AiOrderProviderReadiness()
            .Evaluate(RecognitionWith(provider), EnabledFeatures(), "Production")
            .Single();

        Assert.Equal("Privacy Approval Missing", result.Status);
    }

    [Fact]
    public void Suspended_provider_is_never_ready()
    {
        var provider = ReadyProvider();
        provider.PrivacyApprovalStatus = "Suspended";
        var result = new AiOrderProviderReadiness()
            .Evaluate(RecognitionWith(provider), EnabledFeatures(), "Staging")
            .Single();

        Assert.Equal("Suspended", result.Status);
    }

    [Fact]
    public void Provider_status_contract_excludes_secret_and_private_storage_fields()
    {
        var names = typeof(AiOrderProviderReadinessDto)
            .GetProperties()
            .Select(x => x.Name)
            .ToArray();
        Assert.DoesNotContain(names, x =>
            x.Contains("ApiKey", StringComparison.OrdinalIgnoreCase) ||
            x.Contains("Secret", StringComparison.OrdinalIgnoreCase) ||
            x.Contains("Path", StringComparison.OrdinalIgnoreCase) ||
            x.Contains("ObjectKey", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Hold_actor_time_reason_and_expiry_are_server_domain_state()
    {
        var now = DateTime.UtcNow;
        var actor = Guid.NewGuid();
        var import = CreateImport();

        import.PlaceRetentionHold("Privacy investigation", actor, now, now.AddDays(5));

        Assert.True(import.HasActiveRetentionHold(now.AddDays(1)));
        Assert.False(import.HasActiveRetentionHold(now.AddDays(6)));
        Assert.Equal(actor, import.RetentionHoldPlacedByAdminId);
        Assert.Equal("Privacy investigation", import.RetentionHoldReason);
        import.ReleaseRetentionHold();
        Assert.False(import.IsRetentionHeld);
        Assert.Null(import.RetentionHoldReason);
    }

    [Fact]
    public void Failed_source_delete_does_not_mark_content_deleted_and_is_backed_off()
    {
        var source = new AiOrderSourceDocument(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            AiOrderCaptureMethod.Upload,
            $"source-documents/{Guid.NewGuid():N}",
            "image/jpeg",
            10,
            1,
            new string('a', 64),
            "protected.jpg",
            Guid.NewGuid(),
            DateTime.UtcNow,
            DateTime.UtcNow.AddDays(-1));
        var retryAt = DateTime.UtcNow.AddMinutes(15);

        source.MarkDeletionFailed("PRIVATE_OBJECT_DELETE_FAILED", retryAt);

        Assert.Null(source.ContentDeletedAt);
        Assert.Equal(AiOrderSourceDeletionOutcome.Failed, source.DeletionOutcome);
        Assert.Equal(1, source.DeletionFailureCount);
        Assert.Equal(retryAt, source.DeletionNextRetryAt);
    }

    [Fact]
    public void Successful_source_delete_is_idempotent_and_preserves_hash_metadata()
    {
        var hash = new string('b', 64);
        var source = new AiOrderSourceDocument(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            AiOrderCaptureMethod.Camera,
            $"source-documents/{Guid.NewGuid():N}",
            "image/png",
            42,
            1,
            hash,
            "protected.png",
            Guid.NewGuid(),
            DateTime.UtcNow,
            DateTime.UtcNow.AddDays(-1));
        var first = DateTime.UtcNow;

        source.MarkContentDeleted(first);
        source.MarkContentDeleted(first.AddMinutes(1));

        Assert.Equal(first, source.ContentDeletedAt);
        Assert.Equal(hash, source.Sha256);
        Assert.Equal(42, source.ByteSize);
    }

    [Fact]
    public void Operations_and_retention_routes_are_admin_only_and_bounded()
    {
        Assert.NotNull(typeof(AiOrderImportsController)
            .GetCustomAttribute<AuthorizeAttribute>());
        Assert.NotNull(typeof(AiOrderOperationsAppService)
            .GetCustomAttribute<AuthorizeAttribute>());
        Assert.NotNull(typeof(AiOrderRetentionAppService)
            .GetCustomAttribute<AuthorizeAttribute>());
        Assert.Equal(
            "operations/status",
            typeof(AiOrderImportsController)
                .GetMethod(nameof(AiOrderImportsController.GetOperationsStatusAsync))!
                .GetCustomAttribute<HttpGetAttribute>()!.Template);
    }

    [Fact]
    public void Retention_service_has_no_side_effect_service_dependencies()
    {
        var dependencies = typeof(AiOrderRetentionAppService)
            .GetConstructors()
            .Single()
            .GetParameters()
            .Select(x => x.ParameterType.Name)
            .ToArray();
        foreach (var forbidden in new[]
                 {
                     "Email", "Inventory", "Production", "Pdf", "CatalogAppService",
                     "OrderAppService", "OnlinePayment",
                 })
            Assert.DoesNotContain(dependencies, x =>
                x.Contains(forbidden, StringComparison.OrdinalIgnoreCase));
    }

    private static AiOrderImport CreateImport() => new(
        Guid.NewGuid(),
        Guid.NewGuid(),
        "1.0",
        "key",
        new string('c', 64),
        "UploadedAbandoned");

    private static AiOrderFeatureOptions EnabledFeatures() => new()
    {
        Enabled = true,
        RecognitionEnabled = true,
    };

    private static AiOrderRecognitionOptions RecognitionWith(
        AiOrderRecognitionProviderOptions provider) => new()
    {
        Enabled = true,
        Providers = new(StringComparer.OrdinalIgnoreCase)
        {
            ["openai"] = provider,
        },
    };

    private static AiOrderRecognitionProviderOptions ReadyProvider() => new()
    {
        Enabled = true,
        DisplayName = "OpenAI",
        ApiKey = "secret",
        BaseUrl = "https://api.openai.com/",
        PrivacyApprovalStatus = "ApprovedForSanitizedTesting",
        ApprovedEnvironment = "Staging",
        PrivacyApprovalDate = DateTime.UtcNow,
        DataUsePolicyReference = "internal-policy-reference",
        AllowedDocumentClassification = "SanitizedOrder",
        LastSanitizedSmokeTestAt = DateTime.UtcNow,
        LastSanitizedSmokeTestSucceeded = true,
        Models = new()
        {
            ["test-model"] = new()
            {
                Enabled = true,
                DisplayName = "Test",
                ApiMode = "Responses",
                ApiVersion = "v1",
                StructuredOutputMode = "json_schema",
                SupportsImages = true,
                PricingVersion = "test-v1",
                EstimatedInputTokensPerMegabyte = 1,
                EstimatedOutputTokens = 1,
            },
        },
    };
}
