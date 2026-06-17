using System.ComponentModel.DataAnnotations;

namespace TeeNova.Auth.Dtos;

public class UpdateAdminUserDto
{
    [MaxLength(100)]
    public string? DisplayName { get; set; }

    public AdminRole Role { get; set; }

    public bool IsActive { get; set; }

    /// <summary>Leave null to keep the existing password unchanged.</summary>
    [MinLength(8), MaxLength(128)]
    public string? NewPassword { get; set; }
}
