using System;

namespace TeeNova.Auth.Dtos;

public class AdminUserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = "";
    public string? DisplayName { get; set; }
    public AdminRole Role { get; set; }
    public bool IsActive { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreationTime { get; set; }
}
