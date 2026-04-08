using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace TeeNova.EntityFrameworkCore;

/// <summary>
/// Used by EF Core CLI tools (dotnet-ef) to create migrations at design time.
/// Run from the solution root: dotnet ef migrations add Init --project src/TeeNova.EntityFrameworkCore --startup-project src/TeeNova.HttpApi.Host
/// </summary>
public class TeeNovaDbContextFactory : IDesignTimeDbContextFactory<TeeNovaDbContext>
{
    public TeeNovaDbContext CreateDbContext(string[] args)
    {
        var configuration = BuildConfiguration();
        var builder = new DbContextOptionsBuilder<TeeNovaDbContext>()
            .UseSqlServer(configuration.GetConnectionString("Default"));

        return new TeeNovaDbContext(builder.Options);
    }

    private static IConfigurationRoot BuildConfiguration()
    {
        return new ConfigurationBuilder()
            .SetBasePath(Path.Combine(Directory.GetCurrentDirectory(),
                "../TeeNova.HttpApi.Host"))
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build();
    }
}
