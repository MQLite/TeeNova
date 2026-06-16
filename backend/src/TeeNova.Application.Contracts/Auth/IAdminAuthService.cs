using System.Threading.Tasks;
using TeeNova.Auth.Dtos;

namespace TeeNova.Auth;

public interface IAdminAuthService
{
    /// <summary>
    /// Validates admin credentials and returns a signed JWT on success, or null if credentials are invalid.
    /// </summary>
    Task<AdminLoginResponseDto?> LoginAsync(AdminLoginRequestDto request);
}
