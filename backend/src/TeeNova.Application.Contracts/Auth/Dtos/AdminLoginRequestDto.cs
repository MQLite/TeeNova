using System.ComponentModel.DataAnnotations;

namespace TeeNova.Auth.Dtos;

public class AdminLoginRequestDto
{
    [Required]
    public string Username { get; set; } = "";

    [Required]
    public string Password { get; set; } = "";
}
