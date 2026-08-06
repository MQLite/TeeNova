using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.Email;
using TeeNova.Enquiries.PrivateStorage;

namespace TeeNova.Enquiries;

public sealed class QuoteRequestReadinessValidator : IHostedService
{
    private readonly QuoteRequestOptions _options;
    private readonly IServiceProvider _services;
    public QuoteRequestReadinessValidator(IOptions<QuoteRequestOptions> options, IServiceProvider services)
    {
        _options = options.Value;
        _services = services;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled) return;
        if (_options.RetentionDays is null or <= 0)
            throw new InvalidOperationException("QuoteRequests is enabled but RetentionDays is not approved and configured.");
        if (string.IsNullOrWhiteSpace(_options.IpHashKey) || _options.IpHashKey.Length < 32)
            throw new InvalidOperationException("QuoteRequests is enabled but IpHashKey is not configured securely.");
        var readiness = await _services.GetRequiredService<IQuotePrivateObjectStorage>().CheckReadinessAsync(cancellationToken);
        if (readiness.Status != PrivateStorageReadinessStatus.Ready)
            throw new InvalidOperationException($"Quote private storage readiness failed: {readiness.Status}.");
        var email = await _services.GetRequiredService<IEmailSettingsProvider>().GetEffectiveSettingsAsync();
        if (string.IsNullOrWhiteSpace(email.Smtp.Host) || string.IsNullOrWhiteSpace(email.SenderAddress))
            throw new InvalidOperationException("QuoteRequests is enabled but SMTP host or sender address is not configured.");
        if (string.IsNullOrWhiteSpace(email.QuoteNotificationEmail))
            throw new InvalidOperationException("QuoteRequests is enabled but no internal quote recipient resolves from quote or Admin email settings.");
        if (string.IsNullOrWhiteSpace(email.QuoteReplyToAddress))
            throw new InvalidOperationException("QuoteRequests is enabled but no quote reply-to resolves from quote or existing reply-to settings.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
