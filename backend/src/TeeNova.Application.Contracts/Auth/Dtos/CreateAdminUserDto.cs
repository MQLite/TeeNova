using System.ComponentModel.DataAnnotations;

namespace TeeNova.Auth.Dtos;

public class CreateAdminUserDto
{
    [Required, MinLength(3), MaxLength(50)]
    public string Username { get; set; } = "";

    [Required, MinLength(8), MaxLength(128)]
    public string Password { get; set; } = "";

    public AdminRole Role { get; set; } = AdminRole.Admin;

    [MaxLength(100)]
    public string? DisplayName { get; set; }
}
