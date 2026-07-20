using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;

namespace TeeNova.AdminLogs;

public sealed class AdminLogsControllerAuthorizationTests
{
    [Fact]
    public void Controller_requires_the_existing_admin_role()
    {
        var attribute = Assert.Single(
            typeof(AdminLogsController).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
                .Cast<AuthorizeAttribute>());

        Assert.Equal(TeeNovaRoles.Admin, attribute.Roles);
        Assert.Equal("Admin", TeeNovaRoles.Admin);
    }

    [Fact]
    public void Download_route_accepts_only_the_opaque_file_id_and_cancellation_token()
    {
        var method = typeof(AdminLogsController).GetMethod(nameof(AdminLogsController.DownloadAsync));
        Assert.NotNull(method);
        var route = Assert.Single(method!.GetCustomAttributes(typeof(HttpGetAttribute), inherit: true)
            .Cast<HttpGetAttribute>());
        Assert.Equal("{fileId}/download", route.Template);

        var parameters = method.GetParameters();
        Assert.Collection(parameters,
            parameter => Assert.Equal("fileId", parameter.Name),
            parameter => Assert.Equal(typeof(CancellationToken), parameter.ParameterType));
        Assert.DoesNotContain(parameters, parameter =>
            parameter.Name is "path" or "directory" or "root" or "sourceDirectory" or "relativePath" or "absolutePath" or "filename");
    }
}
