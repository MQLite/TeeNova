using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using TeeNova.Auth;
using TeeNova.Email;
using TeeNova.Files;
using TeeNova.Inventory;
using TeeNova.Payments;
using TeeNova.Payments.Mock;
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

        context.Services.Configure<AdminAuthOptions>(configuration.GetSection("AdminAuth"));
        context.Services.Configure<JwtOptions>(configuration.GetSection("Jwt"));

        context.Services.Configure<EmailOptions>(configuration.GetSection("Email"));

        context.Services.AddTransient<IEmailSettingsProvider, EmailSettingsProvider>();
        context.Services.AddTransient<IOrderEmailNotificationService, OrderEmailNotificationService>();

        context.Services.Configure<OnlinePaymentOptions>(configuration.GetSection("OnlinePayments"));

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
                // Missing Stripe secrets must fail startup, not the first checkout/webhook (Jira 9802).
                // The check names the missing keys but never echoes configured values.
                OnlinePaymentStartupGuard.EnsureStripeSecretsPresent(
                    paymentsEnabled,
                    stripeSection["SecretKey"],
                    stripeSection["WebhookSecret"]);

                context.Services.AddTransient<IOnlinePaymentProvider, StripeOnlinePaymentProvider>();
            }
        }
        // else: UseMockProviders=true outside Development with payments disabled — no providers are
        // registered, so an unsigned mock webhook payload can never be parsed in this environment.
    }

    public override async Task OnApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        await context.AddBackgroundWorkerAsync<OrphanedAssetCleanupWorker>();
    }
}
