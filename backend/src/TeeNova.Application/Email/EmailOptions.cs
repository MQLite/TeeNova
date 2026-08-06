namespace TeeNova.Email;

public class EmailOptions
{
    public SmtpOptions Smtp { get; set; } = new();
    public string SenderName { get; set; } = string.Empty;
    public string SenderAddress { get; set; } = string.Empty;
    public string ReplyToAddress { get; set; } = string.Empty;
    public string AdminNotificationEmail { get; set; } = string.Empty;
    public string QuoteNotificationEmail { get; set; } = string.Empty;
    public string QuoteReplyToAddress { get; set; } = string.Empty;
    public string ShopContactInfo { get; set; } = string.Empty;

    /// <summary>Base URL for admin order detail links, e.g. https://admin.example.com/admin/orders</summary>
    public string AdminOrderBaseUrl { get; set; } = string.Empty;

    public class SmtpOptions
    {
        public string Host { get; set; } = string.Empty;
        public int Port { get; set; } = 587;
        public string UserName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public bool EnableSsl { get; set; } = true;
    }
}
