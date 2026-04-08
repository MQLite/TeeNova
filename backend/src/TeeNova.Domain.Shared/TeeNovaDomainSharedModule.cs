using Volo.Abp.Domain;
using Volo.Abp.Modularity;

namespace TeeNova;

[DependsOn(
    typeof(AbpDddDomainSharedModule)
)]
public class TeeNovaDomainSharedModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        // Configure localization, validation error codes, etc. here
    }
}
