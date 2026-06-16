using System;

namespace TeeNova.Auth.Dtos;

public class AdminLoginResponseDto
{
    public string Token { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public string Username { get; set; } = "";
}
