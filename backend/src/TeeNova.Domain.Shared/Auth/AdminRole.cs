namespace TeeNova.Auth;

public enum AdminRole
{
    /// <summary>Full access: can manage orders, products, assets, settings, and other admin users.</summary>
    Admin = 1,

    /// <summary>Read-only access: can view everything but cannot modify data.</summary>
    Viewer = 2,
}
