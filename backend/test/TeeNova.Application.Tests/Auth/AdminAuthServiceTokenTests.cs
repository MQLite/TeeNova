using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using TeeNova.Auth.Dtos;
using Volo.Abp.Security.Claims;

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

    [Fact]
    public void Validated_token_resolves_the_admin_user_id_for_ICurrentUser()
    {
        // The bearer handler remaps inbound "sub" onto ClaimTypes.NameIdentifier, so a
        // username in "sub" shadows the real id and ICurrentUser.Id silently returns null.
        var userId = Guid.NewGuid();
        var options = new JwtOptions
        {
            Secret = "test-only-secret-that-is-at-least-32-characters",
            Issuer = "tests",
            Audience = "tests",
            ExpiryMinutes = 10,
        };
        var method = typeof(AdminAuthService).GetMethod(
            "IssueToken",
            BindingFlags.NonPublic | BindingFlags.Static);
        var response = Assert.IsType<AdminLoginResponseDto>(method!.Invoke(
            null,
            [new AdminUser(userId, "administrator", "hash", AdminRole.Admin), options]));

        var principal = new JwtSecurityTokenHandler().ValidateToken(
            response.Token,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = options.Issuer,
                ValidAudience = options.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(options.Secret)),
                ClockSkew = TimeSpan.Zero,
            },
            out _);

        // ABP resolves ICurrentUser.Id from the FIRST claim of this type, so a shadowing
        // username claim ahead of the id is exactly what broke the AI import services.
        var userIdClaim = principal.Claims.First(claim => claim.Type == AbpClaimTypes.UserId);
        Assert.True(Guid.TryParse(userIdClaim.Value, out var resolvedUserId));
        Assert.Equal(userId, resolvedUserId);
        Assert.Equal("administrator", principal.FindFirst(ClaimTypes.Name)?.Value);
        Assert.Equal(TeeNovaRoles.Admin, principal.FindFirst(ClaimTypes.Role)?.Value);
    }
}
