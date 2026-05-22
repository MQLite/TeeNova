using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TeeNova.Email;
using TeeNova.Files;
using TeeNova.Payments;
using TeeNova.Payments.Mock;
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

        context.Services.Configure<EmailOptions>(
            context.Services.GetConfiguration().GetSection("Email"));

        context.Services.AddTransient<IEmailSettingsProvider, EmailSettingsProvider>();
        context.Services.AddTransient<IOrderEmailNotificationService, OrderEmailNotificationService>();

        context.Services.Configure<OnlinePaymentOptions>(
            context.Services.GetConfiguration().GetSection("OnlinePayments"));

        context.Services.AddTransient<IOnlinePaymentProviderResolver, OnlinePaymentProviderResolver>();

        // Register mock providers only when explicitly enabled — never in production.
        var useMockProviders = context.Services.GetConfiguration()
            .GetSection("OnlinePayments")
            .GetValue<bool>("UseMockProviders");

        if (useMockProviders)
        {
            context.Services.AddTransient<IOnlinePaymentProvider, MockStripeOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockWindcaveOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockPoliOnlinePaymentProvider>();
            context.Services.AddTransient<IOnlinePaymentProvider, MockPayPalOnlinePaymentProvider>();
        }
    }

    public override async Task OnApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        await context.AddBackgroundWorkerAsync<OrphanedAssetCleanupWorker>();
    }
}
