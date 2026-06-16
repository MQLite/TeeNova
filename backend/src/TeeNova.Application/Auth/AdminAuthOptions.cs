namespace TeeNova.Auth;

public class AdminAuthOptions
{
    public string Username { get; set; } = "";

    /// <summary>BCrypt hash of the admin password. Generate with: BCrypt.Net.BCrypt.HashPassword("your-password", workFactor: 12)</summary>
    public string PasswordHash { get; set; } = "";

    public AdminAuthRateLimitOptions RateLimit { get; set; } = new();
}

public class AdminAuthRateLimitOptions
{
    public bool Enabled { get; set; } = true;
    public int PermitLimit { get; set; } = 5;
    public int WindowSeconds { get; set; } = 60;
    public int QueueLimit { get; set; } = 0;
}
