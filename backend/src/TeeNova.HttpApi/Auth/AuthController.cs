using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TeeNova.Auth;
using TeeNova.Auth.Dtos;

namespace TeeNova.HttpApi.Auth;

[ApiController]
[Route("api/auth")]
public class AuthController : TeeNovaControllerBase
{
    private readonly IAdminAuthService _authService;

    public AuthController(IAdminAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>
    /// Authenticates an admin user and returns a signed JWT.
    /// POST /api/auth/login
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("AdminLoginPolicy")]
    public async Task<IActionResult> LoginAsync([FromBody] AdminLoginRequestDto input)
    {
        var result = await _authService.LoginAsync(input);

        if (result is null)
            return Unauthorized(new { message = "Invalid username or password." });

        return Ok(result);
    }

    /// <summary>
    /// Returns the currently authenticated admin's identity claims.
    /// GET /api/auth/me
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var username = User.FindFirst(ClaimTypes.Name)?.Value
                    ?? User.FindFirst("sub")?.Value
                    ?? User.Identity?.Name;

        var roles = User.Claims
            .Where(c => c.Type == ClaimTypes.Role)
            .Select(c => c.Value)
            .ToList();

        return Ok(new
        {
            username,
            roles,
        });
    }
}
