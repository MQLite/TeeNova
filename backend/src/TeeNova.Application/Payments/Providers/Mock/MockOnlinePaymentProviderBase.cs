using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.Payments.Mock;

/// <summary>
/// Base class for mock/test online payment provider implementations.
/// Produces fake session IDs and checkout URLs for local development without contacting
/// any external service. Does NOT record payment, create PaymentTransaction, or mark
/// the order paid — the returned URL is a placeholder only.
/// </summary>
public abstract class MockOnlinePaymentProviderBase : IOnlinePaymentProvider
{
    public abstract PaymentProvider Provider { get; }

    public Task<CreateOnlinePaymentProviderSessionResult> CreatePaymentSessionAsync(
        CreateOnlinePaymentProviderSessionRequest request,
        CancellationToken                         cancellationToken = default)
    {
        if (request.Provider != Provider)
            throw new InvalidOperationException(
                $"Mock provider '{Provider}' received a request for '{request.Provider}'.");

        if (request.Amount <= 0)
            throw new ArgumentException("Amount must be greater than zero.", nameof(request));

        if (string.IsNullOrWhiteSpace(request.Currency))
            throw new ArgumentException("Currency is required.", nameof(request));

        var providerName   = Provider.ToString().ToLowerInvariant();
        var mockSessionId  = $"mock_{providerName}_{Guid.NewGuid():N}";
        var mockCheckoutUrl = BuildMockCheckoutUrl(request, mockSessionId);

        return Task.FromResult(new CreateOnlinePaymentProviderSessionResult
        {
            Provider            = Provider,
            ProviderSessionId   = mockSessionId,
            ProviderCheckoutUrl = mockCheckoutUrl,
            ProviderPaymentId   = null,
            RawProviderStatus   = "mock_pending",
        });
    }

    public Task<OnlinePaymentWebhookResult> ParseWebhookAsync(
        string                              rawBody,
        IReadOnlyDictionary<string, string> headers,
        CancellationToken                   cancellationToken = default)
    {
        return Task.FromResult(new OnlinePaymentWebhookResult
        {
            Provider          = Provider,
            Outcome           = OnlinePaymentWebhookOutcome.Ignored,
            RawProviderStatus = "mock_webhook_not_implemented",
        });
    }

    private string BuildMockCheckoutUrl(
        CreateOnlinePaymentProviderSessionRequest request,
        string mockSessionId)
    {
        var providerName = Provider.ToString().ToLowerInvariant();
        var amount       = request.Amount.ToString(CultureInfo.InvariantCulture);

        // SuccessUrl already contains query params (orderId, orderNumber) from OrderAppService.
        var separator = request.SuccessUrl.Contains('?') ? "&" : "?";

        return $"{request.SuccessUrl}{separator}" +
               $"mockProvider={Uri.EscapeDataString(providerName)}" +
               $"&mockSessionId={Uri.EscapeDataString(mockSessionId)}" +
               $"&mockAmount={Uri.EscapeDataString(amount)}" +
               $"&mockCurrency={Uri.EscapeDataString(request.Currency)}" +
               $"&mockPurpose={Uri.EscapeDataString(request.Purpose.ToString())}";
    }
}
