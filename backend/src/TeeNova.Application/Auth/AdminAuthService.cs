using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using TeeNova.Auth.Dtos;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Auth;

public class AdminAuthService : IAdminAuthService, ITransientDependency
{
    private readonly IOptions<AdminAuthOptions> _adminOpts;
    private readonly IOptions<JwtOptions> _jwtOpts;
    private readonly ILogger<AdminAuthService> _logger;

    public AdminAuthService(
        IOptions<AdminAuthOptions> adminOpts,
        IOptions<JwtOptions> jwtOpts,
        ILogger<AdminAuthService> logger)
    {
        _adminOpts = adminOpts;
        _jwtOpts   = jwtOpts;
        _logger    = logger;
    }

    public Task<AdminLoginResponseDto?> LoginAsync(AdminLoginRequestDto request)
    {
        var adminCfg = _adminOpts.Value;
        var jwtCfg   = _jwtOpts.Value;

        // Username comparison is case-insensitive; password check uses constant-time BCrypt verify.
        var usernameMatch = string.Equals(request.Username, adminCfg.Username, StringComparison.OrdinalIgnoreCase);
        var passwordMatch = usernameMatch && BCrypt.Net.BCrypt.Verify(request.Password, adminCfg.PasswordHash);

        if (!usernameMatch || !passwordMatch)
        {
            // Log at Information (not Warning/Error) to avoid alarming on routine bad-password attempts.
            _logger.LogInformation("Admin login failed for username '{Username}'.", request.Username);
            return Task.FromResult<AdminLoginResponseDto?>(null);
        }

        var response = IssueToken(adminCfg.Username, jwtCfg);
        _logger.LogInformation("Admin login succeeded for '{Username}'.", adminCfg.Username);
        return Task.FromResult<AdminLoginResponseDto?>(response);
    }

    private static AdminLoginResponseDto IssueToken(string username, JwtOptions cfg)
    {
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiresAt = DateTime.UtcNow.AddMinutes(cfg.ExpiryMinutes);

        var token = new JwtSecurityToken(
            issuer:            cfg.Issuer,
            audience:          cfg.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub,  username),
                new Claim(JwtRegisteredClaimNames.Jti,  Guid.NewGuid().ToString()),
                new Claim(ClaimTypes.Name,              username),
                new Claim(ClaimTypes.Role,              "Admin"),
            ],
            notBefore:         DateTime.UtcNow,
            expires:           expiresAt,
            signingCredentials: creds);

        return new AdminLoginResponseDto
        {
            Token     = new JwtSecurityTokenHandler().WriteToken(token),
            ExpiresAt = expiresAt,
            Username  = username,
        };
    }
}
