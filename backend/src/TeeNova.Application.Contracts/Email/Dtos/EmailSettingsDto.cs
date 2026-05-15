namespace TeeNova.Email.Dtos;

/// <summary>
/// Admin-editable email notification business settings.
/// Does NOT include SMTP credentials, SMTP host/port/SSL, or SenderAddress.
/// </summary>
public class EmailSettingsDto
{
    public string? AdminNotificationEmail { get; set; }
    public string? ReplyToAddress         { get; set; }
    public string? SenderName             { get; set; }
    public string? ShopContactInfo        { get; set; }
    public string? ReadyPickupMessage     { get; set; }
    public string? ReadyShippingMessage   { get; set; }
    public string? CompletedMessage       { get; set; }
    public string? AdminOrderBaseUrl      { get; set; }
}
