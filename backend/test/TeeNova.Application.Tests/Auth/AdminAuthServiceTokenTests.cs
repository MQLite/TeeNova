using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Security.Claims;
using TeeNova.Auth.Dtos;

namespace TeeNova.Auth;

public sealed class AdminAuthServiceTokenTests
{
    [Fact]
    public void Issued_admin_token_contains_stable_user_id_without_changing_role_identity()
    {
        var userId = Guid.NewGuid();
        var user = new AdminUser(userId, "administrator", "hash", AdminRole.Admin);
        var options = new JwtOptions
        {
            Secret = "test-only-secret-that-is-at-least-32-characters",
            Issuer = "tests",
            Audience = "tests",
            ExpiryMinutes = 10,
        };
        var method = typeof(AdminAuthService).GetMethod("IssueToken", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);

        var response = Assert.IsType<AdminLoginResponseDto>(method!.Invoke(null, [user, options]));
        var token = new JwtSecurityTokenHandler().ReadJwtToken(response.Token);

        Assert.Contains(token.Claims, claim =>
            claim.Value == userId.ToString()
            && claim.Type is "nameid" or ClaimTypes.NameIdentifier);
        Assert.Contains(token.Claims, claim => claim.Type == ClaimTypes.Role && claim.Value == TeeNovaRoles.Admin);
        Assert.Contains(token.Claims, claim => claim.Type == ClaimTypes.Name && claim.Value == "administrator");
    }
}
