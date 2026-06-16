using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TeeNova.Auth;
using TeeNova.Email;
using TeeNova.Files;
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

        context.Services.AddTransient<IOnlinePaymentProviderResolver, OnlinePaymentProviderResolver>();

        // Register mock providers only when explicitly enabled — never in production.
        var useMockProviders = configuration
            .GetSection("OnlinePayments")
            .GetValue<bool>("UseMockProviders");

        if (useMockProviders)
        {
            context.Services.AddTransient<IOnlinePaymentProvider, MockStripeOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockWindcaveOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockPoliOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockPayPalOnlinePaymentProvider>();
        }
        else
        {
            // Register real provider implementations.
            // Only providers with Enabled = true are registered; the resolver throws if a
            // disabled/unregistered provider is requested.
            // PayPal, Windcave, and POLi implementations are added in Jira 7037, 7040, 7041.
            var providersConfig = configuration.GetSection("OnlinePayments:Providers");

            if (providersConfig.GetSection("Stripe").GetValue<bool>("Enabled"))
                context.Services.AddTransient<IOnlinePaymentProvider, StripeOnlinePaymentProvider>();
        }
    }

    public override async Task OnApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        await context.AddBackgroundWorkerAsync<OrphanedAssetCleanupWorker>();
    }
}
