namespace TeeNova.Auth;

public class JwtOptions
{
    /// <summary>HS256 signing key. Must be at least 32 characters (256 bits).</summary>
    public string Secret { get; set; } = "";

    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public int ExpiryMinutes { get; set; } = 480;
}
