using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;

namespace TeeNova.Payments.Stripe;

/// <summary>
/// Real Stripe hosted checkout provider. Handles Checkout Session creation and webhook
/// signature validation with event mapping to the provider-neutral result model.
/// </summary>
public sealed class StripeOnlinePaymentProvider : IOnlinePaymentProvider
{
    private readonly IOptions<OnlinePaymentOptions>       _options;
    private readonly ILogger<StripeOnlinePaymentProvider> _logger;

    public PaymentProvider Provider => PaymentProvider.Stripe;

    public StripeOnlinePaymentProvider(
        IOptions<OnlinePaymentOptions>        options,
        ILogger<StripeOnlinePaymentProvider>  logger)
    {
        _options = options;
        _logger  = logger;
    }

    // ── Session creation ──────────────────────────────────────────────────────

    public async Task<CreateOnlinePaymentProviderSessionResult> CreatePaymentSessionAsync(
        CreateOnlinePaymentProviderSessionRequest request,
        CancellationToken                         cancellationToken = default)
    {
        if (request.Provider != Provider)
            throw new InvalidOperationException(
                $"Stripe provider received a request for '{request.Provider}'.");

        if (request.Amount <= 0)
            throw new ArgumentException("Amount must be greater than zero.", nameof(request));

        if (string.IsNullOrWhiteSpace(request.Currency))
            throw new ArgumentException("Currency is required.", nameof(request));

        if (string.IsNullOrWhiteSpace(request.SuccessUrl))
            throw new ArgumentException("SuccessUrl is required.", nameof(request));

        if (string.IsNullOrWhiteSpace(request.CancelUrl))
            throw new ArgumentException("CancelUrl is required.", nameof(request));

        var secretKey = ResolveSecretKey();

        // Stripe requires amounts in minor units (cents). NZD has 2 decimal places.
        // AwayFromZero matches standard financial rounding.
        var amountMinorUnits = (long)Math.Round(request.Amount * 100m, MidpointRounding.AwayFromZero);

        // Stripe currency codes must be lowercase.
        var currency = request.Currency.ToLowerInvariant();

        var sessionOptions = new SessionCreateOptions
        {
            Mode          = "payment",
            CustomerEmail = string.IsNullOrWhiteSpace(request.CustomerEmail) ? null : request.CustomerEmail,
            SuccessUrl    = request.SuccessUrl,
            CancelUrl     = request.CancelUrl,
            LineItems     = new List<SessionLineItemOptions>
            {
                new()
                {
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency    = currency,
                        UnitAmount  = amountMinorUnits,
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = $"Order #{request.OrderNumber}",
                        },
                    },
                    Quantity = 1,
                },
            },
            Metadata = new Dictionary<string, string>
            {
                ["order_id"]        = request.OrderId.ToString(),
                ["order_number"]    = request.OrderNumber,
                ["payment_purpose"] = request.Purpose.ToString(),
            },
            PaymentIntentData = new SessionPaymentIntentDataOptions
            {
                Metadata = new Dictionary<string, string>
                {
                    ["order_id"]     = request.OrderId.ToString(),
                    ["order_number"] = request.OrderNumber,
                },
            },
        };

        // Idempotency key scoped to order + purpose + amount + currency (Jira 9804). Including the
        // minor-unit amount and currency means identical retries/double-submits collapse to ONE Stripe
        // session, while a changed amount (e.g. after an admin price adjustment or a partial payment)
        // produces a DIFFERENT key — so Stripe returns a fresh session instead of an idempotency
        // conflict against a session frozen at the old amount.
        var idempotencyKey =
            $"stripe_session_{request.OrderId}_{request.Purpose}_{amountMinorUnits}_{currency}";

        Session session;
        try
        {
            // StripeClient is instantiated per-call here (acceptable for sandbox throughput).
            // For high-volume production use, register StripeClient as a singleton via DI.
            var client  = new StripeClient(secretKey);
            var service = new SessionService(client);

            session = await service.CreateAsync(
                sessionOptions,
                new RequestOptions { IdempotencyKey = idempotencyKey },
                cancellationToken);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex,
                "[Stripe] Session creation failed for order {OrderNumber}. " +
                "StripeError code: {Code} — {Message}.",
                request.OrderNumber, ex.StripeError?.Code, ex.StripeError?.Message);

            throw new InvalidOperationException(
                $"Stripe checkout session creation failed for order '{request.OrderNumber}': " +
                $"{ex.StripeError?.Message ?? ex.Message}", ex);
        }

        if (string.IsNullOrWhiteSpace(session.Url))
            throw new InvalidOperationException(
                $"Stripe session '{session.Id}' was created but returned no checkout URL " +
                $"for order '{request.OrderNumber}'.");

        _logger.LogInformation(
            "[Stripe] Checkout session {SessionId} created for order {OrderNumber} — " +
            "{Amount} {Currency} ({MinorUnits} minor units).",
            session.Id, request.OrderNumber,
            request.Amount, request.Currency.ToUpperInvariant(), amountMinorUnits);

        return new CreateOnlinePaymentProviderSessionResult
        {
            Provider            = Provider,
            ProviderSessionId   = session.Id,
            ProviderCheckoutUrl = session.Url,
            ProviderPaymentId   = null,
            RawProviderStatus   = session.Status,
        };
    }

    // ── Session expiration ────────────────────────────────────────────────────

    public async Task ExpireSessionAsync(
        string            providerSessionId,
        CancellationToken cancellationToken = default)
    {
        // Best-effort (Jira 9804): expire a still-open Checkout Session so a lingering customer tab
        // cannot complete a charge the local system has already superseded/cancelled. Never throws —
        // an already-expired / already-completed / unknown session is an acceptable no-op — and never
        // logs the secret key.
        if (string.IsNullOrWhiteSpace(providerSessionId))
            return;

        try
        {
            var client  = new StripeClient(ResolveSecretKey());
            var service = new SessionService(client);

            await service.ExpireAsync(providerSessionId, cancellationToken: cancellationToken);

            _logger.LogInformation(
                "[Stripe] Checkout session {SessionId} expired server-side.", providerSessionId);
        }
        catch (StripeException ex)
        {
            // Most commonly the session is already in a terminal state (expired/completed) and cannot
            // be expired again. Log the code only — never the webhook/secret key — and swallow.
            _logger.LogWarning(
                "[Stripe] Could not expire session {SessionId} — Code: {Code}. " +
                "Ignoring (best-effort); local cancellation remains authoritative.",
                providerSessionId, ex.StripeError?.Code ?? "expire_error");
        }
    }

    // ── Webhook parsing ───────────────────────────────────────────────────────

    public Task<OnlinePaymentWebhookResult> ParseWebhookAsync(
        string                              rawBody,
        IReadOnlyDictionary<string, string> headers,
        CancellationToken                   cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            _logger.LogWarning("[Stripe] Webhook received with empty body — ignoring.");
            return Task.FromResult(MakeIgnored("empty_body"));
        }

        var webhookSecret = ResolveWebhookSecret();

        if (!headers.TryGetValue("Stripe-Signature", out var stripeSignature) ||
            string.IsNullOrWhiteSpace(stripeSignature))
        {
            _logger.LogWarning("[Stripe] Webhook received without Stripe-Signature header — ignoring.");
            return Task.FromResult(MakeIgnored("missing_stripe_signature"));
        }

        Event stripeEvent;
        try
        {
            // throwOnApiVersionMismatch = false tolerates API version differences between
            // the Stripe dashboard webhook configuration and the Stripe.net SDK version.
            stripeEvent = EventUtility.ConstructEvent(
                rawBody,
                stripeSignature,
                webhookSecret,
                throwOnApiVersionMismatch: false);
        }
        catch (StripeException ex)
        {
            // Signature mismatch, expired timestamp, or malformed payload.
            // Log the error code only — never log the webhook secret.
            _logger.LogWarning(
                "[Stripe] Webhook signature validation failed — Code: {Code}.",
                ex.StripeError?.Code ?? "signature_verification_error");

            return Task.FromResult(MakeIgnored("invalid_signature"));
        }

        _logger.LogDebug(
            "[Stripe] Webhook validated — type: {EventType}, id: {EventId}.",
            stripeEvent.Type, stripeEvent.Id);

        return Task.FromResult(MapStripeEvent(stripeEvent));
    }

    // ── Event mapping ─────────────────────────────────────────────────────────

    private OnlinePaymentWebhookResult MapStripeEvent(Event stripeEvent) =>
        stripeEvent.Type switch
        {
            "checkout.session.completed"    => MapCheckoutSessionCompleted(stripeEvent),
            "checkout.session.expired"      => MapCheckoutSessionExpired(stripeEvent),
            "payment_intent.payment_failed" => MapPaymentIntentFailed(stripeEvent),
            // Verified but unsupported: carry the event id so it is recorded as an Ignored idempotency
            // record (Jira 9806) rather than silently dropped.
            _                               => MakeVerifiedIgnored(stripeEvent, "unsupported_event"),
        };

    private OnlinePaymentWebhookResult MapCheckoutSessionCompleted(Event stripeEvent)
    {
        if (stripeEvent.Data.Object is not Session session)
        {
            _logger.LogWarning(
                "[Stripe] checkout.session.completed event {EventId} had no Session data — ignoring.",
                stripeEvent.Id);
            return MakeVerifiedIgnored(stripeEvent, "missing_session_object");
        }

        // AmountTotal is in Stripe minor units (cents); convert to major units (dollars).
        var amount = session.AmountTotal.HasValue
            ? session.AmountTotal.Value / 100m
            : (decimal?)null;

        _logger.LogInformation(
            "[Stripe] checkout.session.completed — session {SessionId}, " +
            "payment intent {PaymentIntentId}, amount {Amount} {Currency}.",
            session.Id, session.PaymentIntentId, amount,
            session.Currency?.ToUpperInvariant());

        return new OnlinePaymentWebhookResult
        {
            Provider          = Provider,
            Outcome           = OnlinePaymentWebhookOutcome.PaymentCompleted,
            SignatureVerified = true,
            ProviderEventType = stripeEvent.Type,
            ProviderSessionId = session.Id,
            ProviderPaymentId = session.PaymentIntentId,
            ProviderEventId   = stripeEvent.Id,
            Amount            = amount,
            Currency          = session.Currency?.ToUpperInvariant(),
            RawProviderStatus = session.Status,
        };
    }

    private OnlinePaymentWebhookResult MapCheckoutSessionExpired(Event stripeEvent)
    {
        if (stripeEvent.Data.Object is not Session session)
        {
            _logger.LogWarning(
                "[Stripe] checkout.session.expired event {EventId} had no Session data — ignoring.",
                stripeEvent.Id);
            return MakeVerifiedIgnored(stripeEvent, "missing_session_object");
        }

        _logger.LogInformation(
            "[Stripe] checkout.session.expired — session {SessionId}.", session.Id);

        return new OnlinePaymentWebhookResult
        {
            Provider          = Provider,
            Outcome           = OnlinePaymentWebhookOutcome.PaymentExpired,
            SignatureVerified = true,
            ProviderEventType = stripeEvent.Type,
            ProviderSessionId = session.Id,
            ProviderEventId   = stripeEvent.Id,
            RawProviderStatus = session.Status ?? "expired",
        };
    }

    private OnlinePaymentWebhookResult MapPaymentIntentFailed(Event stripeEvent)
    {
        if (stripeEvent.Data.Object is not PaymentIntent paymentIntent)
        {
            _logger.LogWarning(
                "[Stripe] payment_intent.payment_failed event {EventId} had no PaymentIntent data — ignoring.",
                stripeEvent.Id);
            return MakeVerifiedIgnored(stripeEvent, "missing_payment_intent_object");
        }

        // A Checkout-created PaymentIntent does not carry the Checkout Session ID in the
        // standard event payload, so ProviderSessionId cannot be populated here.
        // OnlinePaymentWebhookAppService safely ignores PaymentFailed results with no
        // ProviderSessionId (logs a warning and returns without mutating state).
        // Terminal session state is handled when checkout.session.expired fires instead.
        _logger.LogInformation(
            "[Stripe] payment_intent.payment_failed — payment intent {PaymentIntentId}, " +
            "status {Status}.",
            paymentIntent.Id, paymentIntent.Status);

        return new OnlinePaymentWebhookResult
        {
            Provider          = Provider,
            Outcome           = OnlinePaymentWebhookOutcome.PaymentFailed,
            SignatureVerified = true,
            ProviderEventType = stripeEvent.Type,
            ProviderSessionId = null,
            ProviderPaymentId = paymentIntent.Id,
            ProviderEventId   = stripeEvent.Id,
            RawProviderStatus = paymentIntent.Status,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private string ResolveSecretKey()
    {
        if (!_options.Value.Providers.TryGetValue("Stripe", out var stripeOpts) ||
            string.IsNullOrWhiteSpace(stripeOpts.SecretKey))
        {
            throw new InvalidOperationException(
                "Stripe SecretKey is not configured. " +
                "For local sandbox testing set it via dotnet user-secrets: " +
                "dotnet user-secrets set \"OnlinePayments:Providers:Stripe:SecretKey\" \"sk_test_...\" " +
                "Never add real Stripe keys to source control.");
        }

        return stripeOpts.SecretKey.Trim();
    }

    private string ResolveWebhookSecret()
    {
        if (!_options.Value.Providers.TryGetValue("Stripe", out var stripeOpts) ||
            string.IsNullOrWhiteSpace(stripeOpts.WebhookSecret))
        {
            throw new InvalidOperationException(
                "Stripe WebhookSecret is not configured. " +
                "For local sandbox testing set it via dotnet user-secrets: " +
                "dotnet user-secrets set \"OnlinePayments:Providers:Stripe:WebhookSecret\" \"whsec_...\" " +
                "Never add real Stripe webhook secrets to source control.");
        }

        return stripeOpts.WebhookSecret.Trim();
    }

    // Pre-verification ignore: no trusted event id, SignatureVerified stays false so the app service
    // never creates a durable idempotency record for an unauthenticated payload (empty body, missing
    // signature header, or failed signature validation).
    private OnlinePaymentWebhookResult MakeIgnored(string rawStatus) => new()
    {
        Provider          = Provider,
        Outcome           = OnlinePaymentWebhookOutcome.Ignored,
        SignatureVerified = false,
        RawProviderStatus = rawStatus,
    };

    // Post-verification ignore: signature already validated, so carry the verified event id/type. The
    // app service records these as an Ignored idempotency entry (Jira 9806) instead of dropping them.
    private OnlinePaymentWebhookResult MakeVerifiedIgnored(Event stripeEvent, string rawStatus) => new()
    {
        Provider          = Provider,
        Outcome           = OnlinePaymentWebhookOutcome.Ignored,
        SignatureVerified = true,
        ProviderEventType = stripeEvent.Type,
        ProviderEventId   = stripeEvent.Id,
        RawProviderStatus = rawStatus,
    };
}
