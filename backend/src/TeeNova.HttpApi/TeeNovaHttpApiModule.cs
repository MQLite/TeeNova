using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;
using Microsoft.Extensions.DependencyInjection;
using TeeNova.Reception;

namespace TeeNova;

[DependsOn(
    typeof(TeeNovaApplicationContractsModule),
    typeof(AbpAspNetCoreMvcModule)
)]
public class TeeNovaHttpApiModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context) =>
        context.Services.AddHostedService<MessengerTrialReplyWorker>();
}
