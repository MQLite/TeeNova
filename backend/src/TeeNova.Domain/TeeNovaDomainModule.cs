using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Domain;
using Volo.Abp.Modularity;

namespace TeeNova;

[DependsOn(
    typeof(TeeNovaDomainSharedModule),
    typeof(AbpDddDomainModule)
)]
public class TeeNovaDomainModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        // Register domain services here
        context.Services.AddTransient<Files.IFileStorageService, Files.LocalFileStorageService>();
    }
}
