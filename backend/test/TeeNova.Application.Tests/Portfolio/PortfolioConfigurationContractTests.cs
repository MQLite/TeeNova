namespace TeeNova.Application.Tests.Portfolio;

public class PortfolioConfigurationContractTests
{
    [Fact]
    public void Backend_feature_is_disabled_and_storage_is_not_under_wwwroot()
    {
        var json=File.ReadAllText(Path.Combine(Repo(),"backend","src","TeeNova.HttpApi.Host","appsettings.json"));
        Assert.Contains("\"Portfolio\"",json); Assert.Contains("\"Enabled\": false",json); Assert.Contains("App_Data/portfolio-media",json); Assert.DoesNotContain("wwwroot/portfolio",json,StringComparison.OrdinalIgnoreCase);
    }
    [Fact]
    public void Migration_is_additive_and_does_not_mutate_protected_tables()
    {
        var file=Directory.GetFiles(Path.Combine(Repo(),"backend","src","TeeNova.EntityFrameworkCore","Migrations"),"*Jira10302*.cs").Single(x=>!x.EndsWith("Designer.cs"));var sql=File.ReadAllText(file);
        Assert.Contains("CreateTable",sql);Assert.Contains("PortfolioItems",sql);Assert.Contains("PortfolioItemImages",sql);
        foreach(var table in new[]{"Orders","Payments","Inventory","Products","Production"})Assert.DoesNotContain($"name: \"{table}\"",sql);
    }
    [Fact]
    public void Public_contract_has_no_storage_key_and_service_filters_published_rows()
    {
        Assert.Null(typeof(TeeNova.Portfolio.PortfolioImageDto).GetProperty("ObjectKey"));
        var source=File.ReadAllText(Path.Combine(Repo(),"backend","src","TeeNova.Application","Portfolio","PortfolioAppService.cs"));
        Assert.Contains("x.Status == PortfolioStatus.Published",source);
        Assert.Contains("PermissionReference=admin?x.PermissionReference:null",source);
    }
    private static string Repo(){var dir=new DirectoryInfo(AppContext.BaseDirectory);while(dir!=null&&!Directory.Exists(Path.Combine(dir.FullName,"backend")))dir=dir.Parent;return dir!.FullName;}
}
