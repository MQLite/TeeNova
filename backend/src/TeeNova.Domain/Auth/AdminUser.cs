using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Auth;

/// <summary>
/// Admin portal user stored in the database.
/// Replaces the single hardcoded admin from appsettings — supports multiple users with role control.
/// </summary>
public class AdminUser : AuditedAggregateRoot<Guid>
{
    public string Username { get; private set; } = "";
    public string PasswordHash { get; private set; } = "";
    public AdminRole Role { get; private set; }
    public bool IsActive { get; private set; }
    public string? DisplayName { get; private set; }
    public DateTime? LastLoginAt { get; set; }

    // Required by EF Core
    private AdminUser() { }

    public AdminUser(Guid id, string username, string passwordHash, AdminRole role, string? displayName = null)
        : base(id)
    {
        Username     = username.Trim().ToLowerInvariant();
        PasswordHash = passwordHash;
        Role         = role;
        IsActive     = true;
        DisplayName  = displayName?.Trim();
    }

    public void SetPassword(string passwordHash)  => PasswordHash = passwordHash;
    public void SetRole(AdminRole role)            => Role = role;
    public void SetActive(bool active)             => IsActive = active;
    public void SetDisplayName(string? displayName) => DisplayName = displayName?.Trim();
}
