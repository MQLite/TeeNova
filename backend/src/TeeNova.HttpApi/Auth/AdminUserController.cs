using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using TeeNova.Auth.Dtos;

namespace TeeNova.HttpApi.Auth;

[ApiController]
[Route("api/admin-users")]
[Authorize(Roles = "Admin")]
public class AdminUserController : TeeNovaControllerBase
{
    private readonly IAdminUserAppService _service;

    public AdminUserController(IAdminUserAppService service)
    {
        _service = service;
    }

    /// <summary>GET /api/admin-users — list all admin users.</summary>
    [HttpGet]
    public Task<List<AdminUserDto>> GetListAsync() => _service.GetListAsync();

    /// <summary>GET /api/admin-users/{id}</summary>
    [HttpGet("{id:guid}")]
    public Task<AdminUserDto> GetAsync(Guid id) => _service.GetAsync(id);

    /// <summary>POST /api/admin-users — create a new admin user.</summary>
    [HttpPost]
    public Task<AdminUserDto> CreateAsync([FromBody] CreateAdminUserDto input)
        => _service.CreateAsync(input);

    /// <summary>PUT /api/admin-users/{id} — update role, display name, active flag, or password.</summary>
    [HttpPut("{id:guid}")]
    public Task<AdminUserDto> UpdateAsync(Guid id, [FromBody] UpdateAdminUserDto input)
        => _service.UpdateAsync(id, input);

    /// <summary>DELETE /api/admin-users/{id} — remove an admin user (cannot delete yourself).</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var currentUsername = User.FindFirst(ClaimTypes.Name)?.Value ?? "";
        await _service.DeleteAsync(id, currentUsername);
        return NoContent();
    }
}
