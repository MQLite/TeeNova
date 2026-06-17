using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TeeNova.Auth.Dtos;
using Volo.Abp;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Auth;

public class AdminUserAppService : IAdminUserAppService, ITransientDependency
{
    private readonly IRepository<AdminUser, Guid> _repository;

    public AdminUserAppService(IRepository<AdminUser, Guid> repository)
    {
        _repository = repository;
    }

    public async Task<List<AdminUserDto>> GetListAsync()
    {
        var users = await _repository.GetListAsync();
        return users
            .OrderBy(u => u.Username)
            .Select(ToDto)
            .ToList();
    }

    public async Task<AdminUserDto> GetAsync(Guid id)
    {
        var user = await _repository.GetAsync(id);
        return ToDto(user);
    }

    public async Task<AdminUserDto> CreateAsync(CreateAdminUserDto input)
    {
        var username = input.Username.Trim().ToLowerInvariant();

        if (await _repository.AnyAsync(u => u.Username == username))
            throw new UserFriendlyException($"Username '{username}' is already taken.");

        var hash = BCrypt.Net.BCrypt.HashPassword(input.Password, workFactor: 12);
        var user = new AdminUser(Guid.NewGuid(), username, hash, input.Role, input.DisplayName);

        await _repository.InsertAsync(user, autoSave: true);
        return ToDto(user);
    }

    public async Task<AdminUserDto> UpdateAsync(Guid id, UpdateAdminUserDto input)
    {
        var user = await _repository.GetAsync(id);

        user.SetDisplayName(input.DisplayName);
        user.SetRole(input.Role);
        user.SetActive(input.IsActive);

        if (!string.IsNullOrWhiteSpace(input.NewPassword))
            user.SetPassword(BCrypt.Net.BCrypt.HashPassword(input.NewPassword, workFactor: 12));

        await _repository.UpdateAsync(user, autoSave: true);
        return ToDto(user);
    }

    public async Task DeleteAsync(Guid id, string currentUsername)
    {
        var user = await _repository.GetAsync(id);

        if (string.Equals(user.Username, currentUsername, StringComparison.OrdinalIgnoreCase))
            throw new UserFriendlyException("You cannot delete your own account.");

        var totalAdmins = await _repository.CountAsync(u => u.Role == AdminRole.Admin && u.IsActive);
        if (user.Role == AdminRole.Admin && totalAdmins <= 1)
            throw new UserFriendlyException("Cannot delete the last active Admin account.");

        await _repository.DeleteAsync(id, autoSave: true);
    }

    private static AdminUserDto ToDto(AdminUser u) => new()
    {
        Id           = u.Id,
        Username     = u.Username,
        DisplayName  = u.DisplayName,
        Role         = u.Role,
        IsActive     = u.IsActive,
        LastLoginAt  = u.LastLoginAt,
        CreationTime = u.CreationTime,
    };
}
