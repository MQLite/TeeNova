using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using TeeNova.Portfolio;

namespace TeeNova.Application.Tests.Portfolio;

public class PortfolioControllerContractTests
{
    [Fact]
    public void Public_actions_are_explicitly_anonymous(){foreach(var name in new[]{nameof(PortfolioController.GetPublishedAsync),nameof(PortfolioController.GetPublishedBySlugAsync),nameof(PortfolioController.GetPublishedImageAsync)})Assert.NotNull(Method(name).GetCustomAttribute<AllowAnonymousAttribute>());}
    [Fact]
    public void Every_mutation_is_admin_only(){foreach(var method in typeof(PortfolioController).GetMethods(BindingFlags.Public|BindingFlags.Instance).Where(x=>x.DeclaringType==typeof(PortfolioController)&&x.GetCustomAttributes().Any(a=>a is HttpPostAttribute or HttpPutAttribute or HttpDeleteAttribute)))Assert.Equal(TeeNovaRoles.Admin,method.GetCustomAttribute<AuthorizeAttribute>()?.Roles);}
    [Fact]
    public void Admin_reads_allow_viewer_but_draft_content_is_admin_only(){Assert.Contains(TeeNovaRoles.Viewer,typeof(PortfolioController).GetCustomAttribute<AuthorizeAttribute>()!.Roles!);Assert.Equal(TeeNovaRoles.Admin,Method(nameof(PortfolioController.GetAdminImageAsync)).GetCustomAttribute<AuthorizeAttribute>()!.Roles);}
    [Fact]
    public void Public_image_has_cache_contract_and_admin_preview_is_no_store(){Assert.Equal(3600,Method(nameof(PortfolioController.GetPublishedImageAsync)).GetCustomAttribute<ResponseCacheAttribute>()!.Duration);Assert.True(Method(nameof(PortfolioController.GetAdminImageAsync)).GetCustomAttribute<ResponseCacheAttribute>()!.NoStore);}
    private static MethodInfo Method(string name)=>typeof(PortfolioController).GetMethod(name)!;
}

