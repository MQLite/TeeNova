namespace TeeNova.Email;

/// <summary>
/// Fully resolved email configuration used by OrderEmailNotificationService and templates.
/// SMTP config and SenderAddress always come from appsettings; business fields come from DB with
/// fallback to appsettings / hardcoded defaults.
/// </summary>
public class EmailSettingsSnapshot
{
    public EmailOptions.SmtpOptions Smtp                { get; init; } = new();
    public string SenderAddress                         { get; init; } = string.Empty;
    public string SenderName                            { get; init; } = string.Empty;
    public string ReplyToAddress                        { get; init; } = string.Empty;
    public string AdminNotificationEmail                { get; init; } = string.Empty;
    public string QuoteNotificationEmail                { get; init; } = string.Empty;
    public string QuoteReplyToAddress                    { get; init; } = string.Empty;
    public string ShopContactInfo                       { get; init; } = string.Empty;
    public string ReadyPickupMessage                    { get; init; } = string.Empty;
    public string ReadyShippingMessage                  { get; init; } = string.Empty;
    public string CompletedMessage                      { get; init; } = string.Empty;
    public string AdminOrderBaseUrl                     { get; init; } = string.Empty;
}
