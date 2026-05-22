using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace TeeNova.Payments.Mock;

/// <summary>
/// Base class for mock/test online payment provider implementations.
/// Produces fake session IDs and checkout URLs for local development without contacting
/// any external service. Does NOT record payment, create PaymentTransaction, or mark
/// the order paid — the returned URL is a placeholder only.
///
/// ParseWebhookAsync accepts a simple JSON body for local QA:
///
///   {
///     "outcome":           "PaymentCompleted",   // required; Ignored|PaymentCompleted|PaymentCancelled|PaymentExpired|PaymentFailed
///     "providerSessionId": "mock_stripe_xxxxx",  // required for all non-Ignored outcomes
///     "providerPaymentId": "mock_payment_001",   // recommended for PaymentCompleted
///     "providerEventId":   "mock_event_001",     // optional
///     "amount":            50.00,                // required for PaymentCompleted
///     "currency":          "NZD",               // required for PaymentCompleted; normalised to uppercase
///     "rawProviderStatus": "mock_completed"      // optional; defaults to outcome-specific value
///   }
/// </summary>
public abstract class MockOnlinePaymentProviderBase : IOnlinePaymentProvider
{
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

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

        var providerName    = Provider.ToString().ToLowerInvariant();
        var mockSessionId   = $"mock_{providerName}_{Guid.NewGuid():N}";
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
        return Task.FromResult(ParseMockWebhook(rawBody));
    }

    // ── Mock webhook parsing ──────────────────────────────────────────────────

    private OnlinePaymentWebhookResult ParseMockWebhook(string rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
            return MakeIgnored("mock_empty_body");

        MockWebhookPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<MockWebhookPayload>(rawBody, _jsonOptions);
        }
        catch (JsonException)
        {
            return MakeIgnored("mock_invalid_json");
        }

        if (payload is null)
            return MakeIgnored("mock_invalid_json");

        if (string.IsNullOrWhiteSpace(payload.Outcome) ||
            !Enum.TryParse<OnlinePaymentWebhookOutcome>(payload.Outcome, ignoreCase: true, out var outcome))
        {
            return MakeIgnored("mock_unknown_outcome");
        }

        var defaultStatus = outcome switch
        {
            OnlinePaymentWebhookOutcome.PaymentCompleted => "mock_completed",
            OnlinePaymentWebhookOutcome.PaymentCancelled => "mock_cancelled",
            OnlinePaymentWebhookOutcome.PaymentExpired   => "mock_expired",
            OnlinePaymentWebhookOutcome.PaymentFailed    => "mock_failed",
            _                                            => "mock_ignored",
        };

        return new OnlinePaymentWebhookResult
        {
            Provider          = Provider,
            Outcome           = outcome,
            ProviderSessionId = payload.ProviderSessionId,
            ProviderPaymentId = payload.ProviderPaymentId,
            ProviderEventId   = payload.ProviderEventId,
            RawProviderStatus = payload.RawProviderStatus ?? defaultStatus,
            Amount            = payload.Amount,
            Currency          = payload.Currency?.ToUpperInvariant(),
        };
    }

    private OnlinePaymentWebhookResult MakeIgnored(string rawStatus) => new()
    {
        Provider          = Provider,
        Outcome           = OnlinePaymentWebhookOutcome.Ignored,
        RawProviderStatus = rawStatus,
    };

    // ── Mock checkout URL ─────────────────────────────────────────────────────

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

    // ── Private DTO ───────────────────────────────────────────────────────────

    private sealed class MockWebhookPayload
    {
        public string?  Outcome           { get; set; }
        public string?  ProviderSessionId { get; set; }
        public string?  ProviderPaymentId { get; set; }
        public string?  ProviderEventId   { get; set; }
        public decimal? Amount            { get; set; }
        public string?  Currency          { get; set; }
        public string?  RawProviderStatus { get; set; }
    }
}
