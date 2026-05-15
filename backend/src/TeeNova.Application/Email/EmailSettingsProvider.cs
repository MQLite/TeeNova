using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeeNova.Notifications;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Email;

public class EmailSettingsProvider : IEmailSettingsProvider
{
    private const string DefaultReadyPickupMessage   = "Your order is ready for pickup. Please visit us at your convenience.";
    private const string DefaultReadyShippingMessage = "Your order is ready and is being prepared for delivery.";
    private const string DefaultCompletedMessage     = "Thank you for your order. We hope you are happy with your prints!";

    private readonly IOptions<EmailOptions>            _options;
    private readonly IRepository<EmailSettings, Guid>  _settingsRepository;
    private readonly ILogger<EmailSettingsProvider>    _logger;

    public EmailSettingsProvider(
        IOptions<EmailOptions>           options,
        IRepository<EmailSettings, Guid> settingsRepository,
        ILogger<EmailSettingsProvider>   logger)
    {
        _options            = options;
        _settingsRepository = settingsRepository;
        _logger             = logger;
    }

    public async Task<EmailSettingsSnapshot> GetEffectiveSettingsAsync()
    {
        var opts = _options.Value;
        EmailSettings? db = null;

        try
        {
            db = await _settingsRepository.FindAsync(EmailSettings.SingletonId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "[EmailSettings] Failed to load email settings from DB. Falling back to appsettings values.");
        }

        return new EmailSettingsSnapshot
        {
            Smtp                   = opts.Smtp,
            SenderAddress          = opts.SenderAddress,
            SenderName             = db?.SenderName             ?? opts.SenderName             ?? string.Empty,
            ReplyToAddress         = db?.ReplyToAddress         ?? opts.ReplyToAddress         ?? string.Empty,
            AdminNotificationEmail = db?.AdminNotificationEmail ?? opts.AdminNotificationEmail ?? string.Empty,
            ShopContactInfo        = db?.ShopContactInfo        ?? opts.ShopContactInfo        ?? string.Empty,
            ReadyPickupMessage     = db?.ReadyPickupMessage     ?? DefaultReadyPickupMessage,
            ReadyShippingMessage   = db?.ReadyShippingMessage   ?? DefaultReadyShippingMessage,
            CompletedMessage       = db?.CompletedMessage       ?? DefaultCompletedMessage,
            AdminOrderBaseUrl      = db?.AdminOrderBaseUrl      ?? opts.AdminOrderBaseUrl      ?? string.Empty,
        };
    }
}
