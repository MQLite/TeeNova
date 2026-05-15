using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using TeeNova.Email;
using TeeNova.Files;
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
    }

    public override async Task OnApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        await context.AddBackgroundWorkerAsync<OrphanedAssetCleanupWorker>();
    }
}
