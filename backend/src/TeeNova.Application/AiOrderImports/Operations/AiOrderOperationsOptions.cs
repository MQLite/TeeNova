using Microsoft.Extensions.Options;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.AiOrderImports.Operations;

public sealed class AiOrderFeatureOptions
{
    public const string SectionName = "AiOrderImport";

    public bool Enabled { get; set; }
    public bool IntakeEnabled { get; set; }
    public bool RecognitionEnabled { get; set; }
    public bool ReviewEnabled { get; set; }
    public bool ConfirmationEnabled { get; set; }
    public bool MaterializationEnabled { get; set; }
    public bool OperationalStatusVisibleToAdmin { get; set; } = true;
}

public sealed class AiOrderOperationsOptions
{
    public const string SectionName = "AiOrderOperations";

    public int MaximumImportsPerAdminPerHour { get; set; } = 20;
    public int MaximumImportsPerAdminPerDay { get; set; } = 100;
    public int MaximumConcurrentRecognitionJobs { get; set; } = 2;
    public int MaximumDailyProviderCalls { get; set; } = 250;
    public decimal MaximumMonthlyTotalCostUsd { get; set; } = 100m;
    public decimal MaximumEstimatedCostPerImportUsd { get; set; } = 4m;
    public long MaximumRawEvidenceStorageBytes { get; set; } = 1_073_741_824;
    public string BudgetTimeZoneId { get; set; } = "UTC";
    public int StatusMaximumCount { get; set; } = 10_000;
    public int AccessAuditPageSizeMaximum { get; set; } = 100;
}

public sealed class AiOrderRetentionOptions
{
    public const string SectionName = "AiOrderRetention";

    public bool WorkerEnabled { get; set; }
    public int WorkerPeriodMinutes { get; set; } = 60;
    public int BatchSize { get; set; } = 25;
    public int MaximumRunSeconds { get; set; } = 30;
    public int RetryBaseMinutes { get; set; } = 15;
    public int RetryMaximumMinutes { get; set; } = 1_440;
    public Dictionary<string, AiOrderRetentionClassOptions> Classes { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    public AiOrderRetentionClassOptions GetRequired(string name) =>
        Classes.TryGetValue(name, out var value)
            ? value
            : throw new InvalidOperationException($"Retention class '{name}' is not configured.");
}

public sealed class AiOrderRetentionClassOptions
{
    public int RetentionDays { get; set; }
    public bool DeletionEligible { get; set; } = true;
    public bool DeleteSourceBytes { get; set; }
    public bool DeleteRawProviderEvidence { get; set; }
    public bool KeepRelationalMetadata { get; set; } = true;
    public bool KeepCanonicalRevisions { get; set; } = true;
    public bool KeepReviewEvidence { get; set; } = true;
    public bool OrderPaymentRetentionOverrides { get; set; }
    public bool HoldBlocksDeletion { get; set; } = true;
}

public sealed class AiOrderOperationalOptionsValidator :
    IValidateOptions<AiOrderFeatureOptions>,
    IValidateOptions<AiOrderOperationsOptions>,
    IValidateOptions<AiOrderRetentionOptions>
{
    private static readonly string[] RequiredRetentionClasses =
    [
        "UploadedAbandoned",
        "ProcessingFailed",
        "Cancelled",
        "NeedsReview",
        "Draft",
        "ConfirmedUnmaterialized",
        "Materialized",
        "RawProviderEvidence",
        "AccessAudit",
        "CanonicalRevision",
        "ReviewEvent",
        "ConfirmationEvidence",
    ];

    public ValidateOptionsResult Validate(string? name, AiOrderFeatureOptions options)
    {
        if (!options.Enabled &&
            (options.IntakeEnabled || options.RecognitionEnabled || options.ReviewEnabled ||
             options.ConfirmationEnabled || options.MaterializationEnabled))
        {
            return ValidateOptionsResult.Fail(
                "AiOrderImport stages cannot be enabled while AiOrderImport:Enabled is false.");
        }

        return ValidateOptionsResult.Success;
    }

    public ValidateOptionsResult Validate(string? name, AiOrderOperationsOptions options)
    {
        if (options.MaximumImportsPerAdminPerHour < 1 ||
            options.MaximumImportsPerAdminPerDay < options.MaximumImportsPerAdminPerHour ||
            options.MaximumConcurrentRecognitionJobs < 1 ||
            options.MaximumDailyProviderCalls < 1 ||
            options.MaximumMonthlyTotalCostUsd < 0 ||
            options.MaximumEstimatedCostPerImportUsd < 0 ||
            options.MaximumRawEvidenceStorageBytes < 0 ||
            options.StatusMaximumCount is < 100 or > 1_000_000 ||
            options.AccessAuditPageSizeMaximum is < 1 or > 500 ||
            string.IsNullOrWhiteSpace(options.BudgetTimeZoneId))
        {
            return ValidateOptionsResult.Fail("AiOrderOperations contains an invalid quota or bound.");
        }

        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(options.BudgetTimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            return ValidateOptionsResult.Fail("AiOrderOperations:BudgetTimeZoneId is unknown.");
        }
        catch (InvalidTimeZoneException)
        {
            return ValidateOptionsResult.Fail("AiOrderOperations:BudgetTimeZoneId is invalid.");
        }

        return ValidateOptionsResult.Success;
    }

    public ValidateOptionsResult Validate(string? name, AiOrderRetentionOptions options)
    {
        if (options.WorkerPeriodMinutes is < 1 or > 1_440 ||
            options.BatchSize is < 1 or > 500 ||
            options.MaximumRunSeconds is < 1 or > 300 ||
            options.RetryBaseMinutes < 1 ||
            options.RetryMaximumMinutes < options.RetryBaseMinutes)
        {
            return ValidateOptionsResult.Fail("AiOrderRetention contains an invalid worker bound.");
        }

        foreach (var required in RequiredRetentionClasses)
        {
            if (!options.Classes.TryGetValue(required, out var policy))
                return ValidateOptionsResult.Fail($"Retention class '{required}' is required.");
            if (policy.RetentionDays is < 0 or > 36_500 ||
                !policy.KeepRelationalMetadata ||
                !policy.KeepCanonicalRevisions ||
                !policy.KeepReviewEvidence)
            {
                return ValidateOptionsResult.Fail(
                    $"Retention class '{required}' has an unsafe or invalid policy.");
            }
        }

        return ValidateOptionsResult.Success;
    }
}

public sealed class AiOrderFeatureGate : ITransientDependency
{
    private readonly AiOrderFeatureOptions _options;

    public AiOrderFeatureGate(IOptions<AiOrderFeatureOptions> options) => _options = options.Value;

    public AiOrderFeatureOptions Snapshot => _options;

    public void RequireIntake() => Require(_options.IntakeEnabled, "Intake");
    public void RequireRecognition() => Require(_options.RecognitionEnabled, "Recognition");
    public void RequireReview() => Require(_options.ReviewEnabled, "Review");
    public void RequireConfirmation() => Require(_options.ConfirmationEnabled, "Confirmation");
    public void RequireMaterialization() => Require(_options.MaterializationEnabled, "Materialization");

    private void Require(bool stageEnabled, string stage)
    {
        if (!_options.Enabled || !stageEnabled)
            throw new BusinessException(
                AiOrderImportErrorCodes.FeatureDisabled,
                $"AI Order Import {stage} is disabled by server configuration.");
    }
}
