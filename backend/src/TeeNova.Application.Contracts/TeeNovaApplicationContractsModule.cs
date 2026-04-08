using Volo.Abp.Application;
using Volo.Abp.Modularity;

namespace TeeNova;

[DependsOn(
    typeof(TeeNovaDomainSharedModule),
    typeof(AbpDddApplicationContractsModule)
)]
public class TeeNovaApplicationContractsModule : AbpModule
{
}
