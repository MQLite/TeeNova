using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;

namespace TeeNova;

[DependsOn(
    typeof(TeeNovaApplicationContractsModule),
    typeof(AbpAspNetCoreMvcModule)
)]
public class TeeNovaHttpApiModule : AbpModule
{
}
