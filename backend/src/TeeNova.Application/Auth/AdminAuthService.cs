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
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Auth;

public class AdminAuthService : IAdminAuthService, ITransientDependency
{
    private readonly IRepository<AdminUser, Guid> _userRepository;
    private readonly IOptions<JwtOptions>         _jwtOpts;
    private readonly ILogger<AdminAuthService>    _logger;

    public AdminAuthService(
        IRepository<AdminUser, Guid> userRepository,
        IOptions<JwtOptions>         jwtOpts,
        ILogger<AdminAuthService>    logger)
    {
        _userRepository = userRepository;
        _jwtOpts        = jwtOpts;
        _logger         = logger;
    }

    public async Task<AdminLoginResponseDto?> LoginAsync(AdminLoginRequestDto request)
    {
        var username = request.Username.Trim().ToLowerInvariant();

        var user = await _userRepository.FindAsync(u => u.Username == username);

        if (user is null || !user.IsActive)
        {
            _logger.LogInformation("Admin login failed for username '{Username}' (not found or inactive).", request.Username);
            return null;
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            _logger.LogInformation("Admin login failed for username '{Username}' (wrong password).", request.Username);
            return null;
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user, autoSave: true);

        var response = IssueToken(user, _jwtOpts.Value);
        _logger.LogInformation("Admin login succeeded for '{Username}' (role: {Role}).", user.Username, user.Role);
        return response;
    }

    private static AdminLoginResponseDto IssueToken(AdminUser user, JwtOptions cfg)
    {
        var key       = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg.Secret));
        var creds     = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiresAt = DateTime.UtcNow.AddMinutes(cfg.ExpiryMinutes);
        var roleName  = user.Role.ToString(); // "Admin" or "Viewer"

        var token = new JwtSecurityToken(
            issuer:   cfg.Issuer,
            audience: cfg.Audience,
            claims:
            [
                // "sub" must carry the user id, not the username: the JWT bearer handler
                // remaps inbound "sub" onto ClaimTypes.NameIdentifier, and ABP's
                // ICurrentUser.Id reads the FIRST NameIdentifier claim. A username there
                // fails Guid.TryParse and leaves CurrentUser.Id null.
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim(ClaimTypes.NameIdentifier,     user.Id.ToString()),
                new Claim(ClaimTypes.Name,             user.Username),
                new Claim(ClaimTypes.Role,             roleName),
            ],
            notBefore:          DateTime.UtcNow,
            expires:            expiresAt,
            signingCredentials: creds);

        return new AdminLoginResponseDto
        {
            Token     = new JwtSecurityTokenHandler().WriteToken(token),
            ExpiresAt = expiresAt,
            Username  = user.Username,
            Role      = roleName,
        };
    }
}
