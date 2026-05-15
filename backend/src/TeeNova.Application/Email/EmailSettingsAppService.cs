using System;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using TeeNova.Email.Dtos;
using TeeNova.Notifications;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Email;

public class EmailSettingsAppService : ApplicationService, IEmailSettingsAppService
{
    private const string DefaultReadyPickupMessage   = "Your order is ready for pickup. Please visit us at your convenience.";
    private const string DefaultReadyShippingMessage = "Your order is ready and is being prepared for delivery.";
    private const string DefaultCompletedMessage     = "Thank you for your order. We hope you are happy with your prints!";

    private readonly IRepository<EmailSettings, Guid>  _settingsRepository;
    private readonly IOptions<EmailOptions>             _options;

    public EmailSettingsAppService(
        IRepository<EmailSettings, Guid> settingsRepository,
        IOptions<EmailOptions>           options)
    {
        _settingsRepository = settingsRepository;
        _options            = options;
    }

    public async Task<EmailSettingsDto> GetAsync()
    {
        var db   = await _settingsRepository.FindAsync(EmailSettings.SingletonId);
        var opts = _options.Value;

        return new EmailSettingsDto
        {
            AdminNotificationEmail = db?.AdminNotificationEmail ?? NullIfEmpty(opts.AdminNotificationEmail),
            ReplyToAddress         = db?.ReplyToAddress         ?? NullIfEmpty(opts.ReplyToAddress),
            SenderName             = db?.SenderName             ?? NullIfEmpty(opts.SenderName),
            ShopContactInfo        = db?.ShopContactInfo        ?? NullIfEmpty(opts.ShopContactInfo),
            ReadyPickupMessage     = db?.ReadyPickupMessage     ?? DefaultReadyPickupMessage,
            ReadyShippingMessage   = db?.ReadyShippingMessage   ?? DefaultReadyShippingMessage,
            CompletedMessage       = db?.CompletedMessage       ?? DefaultCompletedMessage,
            AdminOrderBaseUrl      = db?.AdminOrderBaseUrl      ?? NullIfEmpty(opts.AdminOrderBaseUrl),
        };
    }

    public async Task<EmailSettingsDto> UpdateAsync(EmailSettingsDto input)
    {
        var adminEmail = Normalize(input.AdminNotificationEmail, 256, "Admin Notification Email");
        var replyTo    = Normalize(input.ReplyToAddress,         256, "Reply-To Email");
        var senderName = Normalize(input.SenderName,             128, "Sender Name");
        var contact    = Normalize(input.ShopContactInfo,        1000, "Shop Contact Info");
        var pickup     = Normalize(input.ReadyPickupMessage,     500, "Ready Pickup Message");
        var shipping   = Normalize(input.ReadyShippingMessage,   500, "Ready Shipping Message");
        var completed  = Normalize(input.CompletedMessage,       500, "Completed Message");
        var baseUrl    = Normalize(input.AdminOrderBaseUrl,      512, "Admin Order Base URL");

        if (adminEmail != null && !IsValidEmail(adminEmail))
            throw new UserFriendlyException(
                $"'{adminEmail}' is not a valid email address for Admin Notification Email.");

        if (replyTo != null && !IsValidEmail(replyTo))
            throw new UserFriendlyException(
                $"'{replyTo}' is not a valid email address for Reply-To.");

        if (baseUrl != null && !IsValidHttpUrl(baseUrl))
            throw new UserFriendlyException(
                $"'{baseUrl}' is not a valid absolute HTTP/HTTPS URL for Admin Order Base URL.");

        var db = await _settingsRepository.FindAsync(EmailSettings.SingletonId);

        if (db == null)
        {
            db = new EmailSettings(EmailSettings.SingletonId)
            {
                AdminNotificationEmail = adminEmail,
                ReplyToAddress         = replyTo,
                SenderName             = senderName,
                ShopContactInfo        = contact,
                ReadyPickupMessage     = pickup,
                ReadyShippingMessage   = shipping,
                CompletedMessage       = completed,
                AdminOrderBaseUrl      = baseUrl,
                LastModificationTime   = DateTime.UtcNow,
            };
            await _settingsRepository.InsertAsync(db, autoSave: true);
        }
        else
        {
            db.AdminNotificationEmail = adminEmail;
            db.ReplyToAddress         = replyTo;
            db.SenderName             = senderName;
            db.ShopContactInfo        = contact;
            db.ReadyPickupMessage     = pickup;
            db.ReadyShippingMessage   = shipping;
            db.CompletedMessage       = completed;
            db.AdminOrderBaseUrl      = baseUrl;
            db.LastModificationTime   = DateTime.UtcNow;
            await _settingsRepository.UpdateAsync(db, autoSave: true);
        }

        return await GetAsync();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string? Normalize(string? value, int maxLength, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        if (value.Length > maxLength)
            throw new UserFriendlyException(
                $"{fieldName} exceeds the maximum length of {maxLength} characters.");
        return value;
    }

    private static string? NullIfEmpty(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value;

    private static bool IsValidEmail(string value)
        => new EmailAddressAttribute().IsValid(value);

    private static bool IsValidHttpUrl(string value)
        => Uri.TryCreate(value, UriKind.Absolute, out var uri)
           && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
