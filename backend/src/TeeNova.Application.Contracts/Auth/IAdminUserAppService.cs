using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Auth.Dtos;

namespace TeeNova.Auth;

public interface IAdminUserAppService
{
    Task<List<AdminUserDto>> GetListAsync();
    Task<AdminUserDto> GetAsync(Guid id);
    Task<AdminUserDto> CreateAsync(CreateAdminUserDto input);
    Task<AdminUserDto> UpdateAsync(Guid id, UpdateAdminUserDto input);
    Task DeleteAsync(Guid id, string currentUsername);
}
