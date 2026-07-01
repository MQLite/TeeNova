namespace TeeNova.Auth;

/// <summary>
/// Role names used by <c>[Authorize(Roles = ...)]</c> checks at the HTTP boundary.
/// These mirror <see cref="AdminRole"/> member names — the same string
/// <see cref="AdminRole"/>.<c>ToString()</c> that <c>AdminAuthService</c> writes into the
/// JWT <c>ClaimTypes.Role</c> claim at login. Using a shared constant keeps the attribute
/// strings in sync with the enum and greppable.
/// </summary>
public static class TeeNovaRoles
{
    /// <summary>Full access: can view and modify all admin data.</summary>
    public const string Admin = nameof(AdminRole.Admin);

    /// <summary>Read-only access: can view admin data but cannot modify it.</summary>
    public const string Viewer = nameof(AdminRole.Viewer);
}
