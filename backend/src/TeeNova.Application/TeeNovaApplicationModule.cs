using System.Threading.Tasks;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AdminLogs;
using TeeNova.AiOrderImports;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.AiOrderImports.Recognition;
using TeeNova.AiOrderImports.Operations;
using TeeNova.AiOrderImports.Validation;
using TeeNova.Auth;
using TeeNova.Email;
using TeeNova.Files;
using TeeNova.Enquiries;
using TeeNova.Inventory;
using TeeNova.Payments;
using TeeNova.Payments.Mock;
using TeeNova.Portfolio;
using TeeNova.Payments.Stripe;
using Volo.Abp;
using Volo.Abp.Application;
using Volo.Abp.AutoMapper;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Modularity;

namespace TeeNova;

[DependsOn(
    typeof(TeeNovaDomainModule),
    typeof(TeeNovaApplicationContractsModule),
    typeof(AbpAutoMapperModule),
    typeof(AbpDddApplicationModule),
    typeof(AbpBackgroundWorkersModule)
)]
public class TeeNovaApplicationModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpAutoMapperOptions>(options =>
        {
            options.AddMaps<TeeNovaApplicationModule>();
        });

        var configuration = context.Services.GetConfiguration();

        context.Services.Configure<PrivateObjectStorageOptions>(
            configuration.GetSection(PrivateObjectStorageOptions.SectionName));
        context.Services.Configure<QuoteRequestOptions>(configuration.GetSection(QuoteRequestOptions.SectionName));
        context.Services.Configure<QuotePrivateStorageOptions>(configuration.GetSection(QuotePrivateStorageOptions.SectionName));
        context.Services.Configure<PortfolioOptions>(configuration.GetSection(PortfolioOptions.SectionName));
        context.Services.AddTransient<PortfolioImageProcessor>();
        context.Services.AddTransient<IPortfolioAppService, PortfolioAppService>();
        context.Services.AddHostedService<QuoteRequestReadinessValidator>();
        context.Services.Configure<AiOrderIntakeOptions>(
            configuration.GetSection(AiOrderIntakeOptions.SectionName));
        context.Services.AddSingleton<IValidateOptions<AiOrderIntakeOptions>, AiOrderIntakeOptionsValidator>();
        context.Services.AddOptions<AiOrderIntakeOptions>().ValidateOnStart();
        context.Services.Configure<AiOrderRecognitionOptions>(
            configuration.GetSection(AiOrderRecognitionOptions.SectionName));
        context.Services.AddSingleton<
            IValidateOptions<AiOrderRecognitionOptions>,
            AiOrderRecognitionOptionsValidator>();
        context.Services.AddOptions<AiOrderRecognitionOptions>().ValidateOnStart();
        context.Services.Configure<AiOrderValidationOptions>(
            configuration.GetSection(AiOrderValidationOptions.SectionName));
        context.Services.AddSingleton<
            IValidateOptions<AiOrderValidationOptions>,
            AiOrderValidationOptionsValidator>();
        context.Services.AddOptions<AiOrderValidationOptions>().ValidateOnStart();
        context.Services.Configure<AiOrderFeatureOptions>(
            configuration.GetSection(AiOrderFeatureOptions.SectionName));
        context.Services.Configure<AiOrderOperationsOptions>(
            configuration.GetSection(AiOrderOperationsOptions.SectionName));
        context.Services.Configure<AiOrderRetentionOptions>(
            configuration.GetSection(AiOrderRetentionOptions.SectionName));
        context.Services.AddSingleton<AiOrderOperationalOptionsValidator>();
        context.Services.AddSingleton<IValidateOptions<AiOrderFeatureOptions>>(
            sp => sp.GetRequiredService<AiOrderOperationalOptionsValidator>());
        context.Services.AddSingleton<IValidateOptions<AiOrderOperationsOptions>>(
            sp => sp.GetRequiredService<AiOrderOperationalOptionsValidator>());
        context.Services.AddSingleton<IValidateOptions<AiOrderRetentionOptions>>(
            sp => sp.GetRequiredService<AiOrderOperationalOptionsValidator>());
        context.Services.AddOptions<AiOrderFeatureOptions>().ValidateOnStart();
        context.Services.AddOptions<AiOrderOperationsOptions>().ValidateOnStart();
        context.Services.AddOptions<AiOrderRetentionOptions>().ValidateOnStart();
        context.Services.AddSingleton<AiOrderOperationalTelemetry>();
        context.Services.AddHostedService<AiOrderStartupReadinessValidator>();
        context.Services.AddHttpClient("AiOrderRecognition", client =>
        {
            // Per-operation linked cancellation enforces the configured provider timeout.
            client.Timeout = System.Threading.Timeout.InfiniteTimeSpan;
        });
        context.Services.AddTransient<
            IAiOrderRecognitionProvider,
            GeminiAiOrderRecognitionProvider>();
        context.Services.AddTransient<
            IAiOrderRecognitionProvider,
            OpenAiOrderRecognitionProvider>();
        context.Services.AddTransient<
            IAiOrderRecognitionProvider,
            ClaudeAiOrderRecognitionProvider>();

        context.Services.Configure<AdminLogsOptions>(configuration.GetSection(AdminLogsOptions.SectionName));
        context.Services.AddSingleton<IValidateOptions<AdminLogsOptions>, AdminLogsOptionsValidator>();
        context.Services.AddOptions<AdminLogsOptions>().ValidateOnStart();
        context.Services.AddDataProtection().SetApplicationName("TeeNova");
        context.Services.AddSingleton(TimeProvider.System);
        context.Services.AddHttpContextAccessor();
        context.Services.AddSingleton<IAdminLogDirectoryEnumerator, AdminLogDirectoryEnumerator>();
        context.Services.AddSingleton<IAdminLogFileMetadataReader, AdminLogFileMetadataReader>();
        context.Services.AddSingleton<IAdminLogFileIdProtector, AdminLogFileIdProtector>();
        context.Services.AddSingleton<IAdminLogFileOpener, AdminLogFileOpener>();
        context.Services.AddSingleton<IAdminLogDownloadAudit, AdminLogDownloadAudit>();
        context.Services.AddTransient<IAdminLogAppService, AdminLogAppService>();
        context.Services.AddTransient<IAdminLogDownloadService, AdminLogDownloadService>();

        context.Services.Configure<AdminAuthOptions>(configuration.GetSection("AdminAuth"));
        context.Services.Configure<JwtOptions>(configuration.GetSection("Jwt"));

        context.Services.Configure<EmailOptions>(configuration.GetSection("Email"));
        // Staging outbound-email guard (Jira 9908.2). Bound from Email:Staging (staging env file only);
        // Mode defaults false so production email behaviour is unchanged.
        context.Services.Configure<EmailStagingOptions>(configuration.GetSection(EmailStagingOptions.SectionName));

        context.Services.AddTransient<IEmailSettingsProvider, EmailSettingsProvider>();
        context.Services.AddTransient<IOrderEmailNotificationService, OrderEmailNotificationService>();
        context.Services.AddTransient<IQuoteRequestEmailService, QuoteRequestEmailService>();

        context.Services.Configure<OnlinePaymentOptions>(configuration.GetSection("OnlinePayments"));

        // Application encryption key for persisted payment secrets (Jira 9902). The Stripe secret key and
        // webhook signing secret are stored only as ciphertext produced by IStringEncryptionService; the key
        // material lives HERE (configuration/user-secrets/env), never in the database. Operators MUST set a
        // strong, environment-unique passphrase via user-secrets/env (Encryption:PassPhrase) — rotating it
        // invalidates previously stored secrets (they must be re-entered by an admin). When unset, ABP's
        // built-in default passphrase is used, which is acceptable ONLY for local development.
        var encryptionPassPhrase = configuration["Encryption:PassPhrase"];
        if (!string.IsNullOrWhiteSpace(encryptionPassPhrase))
        {
            context.Services.Configure<Volo.Abp.Security.Encryption.AbpStringEncryptionOptions>(options =>
            {
                options.DefaultPassPhrase = encryptionPassPhrase;
            });
        }

        // Inventory auto-deduction (Jira 9005) — the enable flag is now DB-backed
        // (InventorySettings), toggled from the admin panel; default OFF.
        context.Services.AddTransient<IInventoryDeductionService, InventoryDeductionService>();

        context.Services.AddTransient<IOnlinePaymentProviderResolver, OnlinePaymentProviderResolver>();

        var onlinePaymentsSection = configuration.GetSection("OnlinePayments");
        var paymentsEnabled       = onlinePaymentsSection.GetValue<bool>("Enabled");
        var useMockProviders      = onlinePaymentsSection.GetValue<bool>("UseMockProviders");

        // Environment fail-safe (Jira 9802): mock providers process UNSIGNED webhook payloads and are
        // therefore strictly Development-only. An unresolvable environment counts as non-Development so
        // this can never fail open. Enabled+mocks outside Development fails startup; with payments
        // disabled the app boots but registers no payment provider at all.
        var environment   = context.Services.GetSingletonInstanceOrNull<IWebHostEnvironment>();
        var isDevelopment = environment != null && environment.IsDevelopment();

        OnlinePaymentStartupGuard.EnsureMockProvidersAreDevelopmentOnly(
            paymentsEnabled, useMockProviders, isDevelopment);

        // Return URL safety (Jira 9811): when payments are enabled the success/cancel browser return URLs
        // must be present and absolute, and outside Development must be HTTPS on a non-local host with no
        // pre-existing query/fragment. Fails startup so a customer can never be redirected to an untrusted
        // origin after checkout.
        OnlinePaymentStartupGuard.EnsureReturnUrlsAreValid(
            paymentsEnabled,
            isDevelopment,
            onlinePaymentsSection["SuccessReturnBaseUrl"],
            onlinePaymentsSection["CancelReturnBaseUrl"]);

        if (OnlinePaymentStartupGuard.ShouldRegisterMockProviders(useMockProviders, isDevelopment))
        {
            context.Services.AddTransient<IOnlinePaymentProvider, MockStripeOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockWindcaveOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockPoliOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockPayPalOnlinePaymentProvider>();
        }
        else if (!useMockProviders)
        {
            // Register real provider implementations.
            // Only providers with Enabled = true are registered; the resolver throws if a
            // disabled/unregistered provider is requested.
            // PayPal, Windcave, and POLi implementations are added in Jira 7037, 7040, 7041.
            var stripeSection = configuration.GetSection("OnlinePayments:Providers:Stripe");

            if (stripeSection.GetValue<bool>("Enabled"))
            {
                // Stripe secrets are NO LONGER sourced from config (Jira 9902): the secret key and webhook
                // secret are resolved at runtime from the encrypted, admin-managed PaymentProviderSetting via
                // IStripePaymentSettingsResolver. The app therefore boots without any Stripe secret present so
                // an admin can configure it in the panel; checkout/webhook then fail closed until a valid,
                // enabled Test-mode configuration exists. (The former EnsureStripeSecretsPresent startup gate is
                // intentionally not called here — it would block boot before configuration is possible.)
                context.Services.AddTransient<IOnlinePaymentProvider, StripeOnlinePaymentProvider>();
            }
        }
        // else: UseMockProviders=true outside Development with payments disabled — no providers are
        // registered, so an unsigned mock webhook payload can never be parsed in this environment.
    }

    public override async Task OnApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        await context.AddBackgroundWorkerAsync<OrphanedAssetCleanupWorker>();
        await context.AddBackgroundWorkerAsync<AiOrderRecognitionWorker>();
        await context.AddBackgroundWorkerAsync<AiOrderRetentionWorker>();
        await context.AddBackgroundWorkerAsync<StagedQuoteAttachmentCleanupWorker>();
    }
}
