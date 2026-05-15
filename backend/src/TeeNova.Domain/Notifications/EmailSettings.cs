using System;
using Volo.Abp.Domain.Entities;

namespace TeeNova.Notifications;

/// <summary>
/// Singleton row of admin-editable email notification business settings.
/// SMTP credentials are never stored here — they remain in appsettings/secrets.
/// </summary>
public class EmailSettings : Entity<Guid>
{
    /// <summary>Well-known singleton ID — there is exactly one row in this table.</summary>
    public static readonly Guid SingletonId = new("a1b2c3d4-e5f6-0000-0000-000000000001");

    public string? AdminNotificationEmail { get; set; }
    public string? ReplyToAddress         { get; set; }
    public string? SenderName             { get; set; }
    public string? ShopContactInfo        { get; set; }
    public string? ReadyPickupMessage     { get; set; }
    public string? ReadyShippingMessage   { get; set; }
    public string? CompletedMessage       { get; set; }
    public string? AdminOrderBaseUrl      { get; set; }
    public DateTime? LastModificationTime { get; set; }
    public Guid?     LastModifierId       { get; set; }

    protected EmailSettings() { }

    public EmailSettings(Guid id) : base(id) { }
}
