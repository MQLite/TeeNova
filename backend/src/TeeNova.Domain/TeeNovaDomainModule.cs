using Microsoft.Extensions.DependencyInjection;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.Enquiries.PrivateStorage;
using TeeNova.Portfolio.PrivateStorage;
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
        context.Services.AddTransient<IPrivateObjectStorage, LocalPrivateObjectStorage>();
        context.Services.AddTransient<IQuotePrivateObjectStorage, LocalQuotePrivateObjectStorage>();
        context.Services.AddTransient<IPortfolioObjectStorage, LocalPortfolioObjectStorage>();
    }
}
