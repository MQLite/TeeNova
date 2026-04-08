using TeeNova;
using Volo.Abp.AspNetCore.Mvc;

namespace TeeNova;

/// <summary>
/// Base controller for all TeeNova API controllers.
/// Inherit to get ABP DI, localization, and exception handling.
/// </summary>
public abstract class TeeNovaControllerBase : AbpControllerBase
{
    protected TeeNovaControllerBase()
    {
        LocalizationResource = typeof(TeeNovaResource);
    }
}
