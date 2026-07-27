using System;
using System.Collections.Generic;
using System.Globalization;
using Stripe.Checkout;
using Volo.Abp;

namespace TeeNova.Payments.Stripe;

/// <summary>Checkout options plus the idempotency key they must be created with.</summary>
internal sealed record StripeCheckoutSessionPlan(SessionCreateOptions Options, string IdempotencyKey);

/// <summary>
/// Pure translation of a provider-neutral session request into stable Stripe Checkout Session options
/// (Phase 3). Deliberately side-effect free and network free, so the exact options — line items, card-only
/// restriction, metadata and idempotency key — can be asserted in unit tests without any Stripe credentials.
///
/// Representation rules:
/// <list type="bullet">
///   <item>surcharge DISABLED — one line item at the charged amount, no payment-method restriction: byte-for-byte
///         the pre-Phase-3 behaviour;</item>
///   <item>surcharge ENABLED — line 1 is the existing order label at the commercial base, line 2 is
///         "<c>Card processing surcharge</c>", and the session is restricted to card payments;</item>
///   <item>surcharge ENABLED but calculated to zero — the zero-value line is omitted (Stripe rejects/obscures
///         zero line items) while the snapshot, disclosure requirement, metadata and card-only rule remain.</item>
/// </list>
/// No preview API, no API-version override, no Stripe.NET upgrade.
/// </summary>
internal static class StripeCheckoutSessionOptionsBuilder
{
    /// <summary>Exact customer-visible wording for the surcharge line. Matches the admin disclosure copy.</summary>
    public const string SurchargeLineItemName = "Card processing surcharge";

    /// <summary>Stripe hard-caps an idempotency key at 255 characters; stay well inside it.</summary>
    private const int MaxIdempotencyKeyLength = 200;

    private const int FingerprintKeySegmentLength = 32;

    public static StripeCheckoutSessionPlan Build(CreateOnlinePaymentProviderSessionRequest request)
    {
        Check.NotNull(request, nameof(request));

        // Local snapshot integrity — the amounts must already be consistent before Stripe ever sees them.
        var baseCents      = StripeMoney.ToCents(request.BaseAmount, "baseAmount");
        var surchargeCents = StripeMoney.ToCents(request.SurchargeAmount, "surchargeAmount");
        var chargedCents   = StripeMoney.ToCents(request.Amount, "chargedAmount");

        if (chargedCents != baseCents + surchargeCents)
            throw new BusinessException("TeeNova:Payment:StripeSnapshotAmountMismatch")
                .WithData("BaseAmountCents", baseCents)
                .WithData("SurchargeAmountCents", surchargeCents)
                .WithData("ChargedAmountCents", chargedCents);

        if (!request.SurchargeEnabled && surchargeCents != 0)
            throw new BusinessException("TeeNova:Payment:StripeSnapshotAmountMismatch")
                .WithData("Reason", "SurchargeAmountWithoutEnabledSurcharge");

        // Stripe currency codes are lowercase.
        var currency = request.Currency.ToLowerInvariant();

        var lineItems = new List<SessionLineItemOptions>
        {
            BuildLineItem(currency, request.SurchargeEnabled ? baseCents : chargedCents, $"Order #{request.OrderNumber}"),
        };

        if (request.SurchargeEnabled && surchargeCents > 0)
            lineItems.Add(BuildLineItem(currency, surchargeCents, SurchargeLineItemName));

        var metadata = BuildMetadata(request, baseCents, surchargeCents, chargedCents);

        var options = new SessionCreateOptions
        {
            Mode          = "payment",
            CustomerEmail = string.IsNullOrWhiteSpace(request.CustomerEmail) ? null : request.CustomerEmail,
            SuccessUrl    = request.SuccessUrl,
            CancelUrl     = request.CancelUrl,
            LineItems     = lineItems,
            Metadata      = metadata,
            PaymentIntentData = new SessionPaymentIntentDataOptions
            {
                // Correlation metadata on the PaymentIntent as well, so a dashboard charge can be tied back
                // to the local order/session without opening the Checkout Session.
                Metadata = BuildPaymentIntentMetadata(request, baseCents, surchargeCents, chargedCents),
            },
        };

        // The fee is disclosed as a CARD processing surcharge, so an enabled-surcharge session must not be
        // payable by a non-card Stripe payment method. Disabled sessions keep Stripe's default behaviour.
        if (request.SurchargeEnabled)
            options.PaymentMethodTypes = new List<string> { "card" };

        return new StripeCheckoutSessionPlan(options, BuildIdempotencyKey(request, chargedCents, currency));
    }

    private static SessionLineItemOptions BuildLineItem(string currency, long unitAmountCents, string name)
        => new()
        {
            PriceData = new SessionLineItemPriceDataOptions
            {
                Currency    = currency,
                UnitAmount  = unitAmountCents,
                ProductData = new SessionLineItemPriceDataProductDataOptions { Name = name },
            },
            Quantity = 1,
        };

    /// <summary>
    /// Correlation-only metadata: compact snake_case keys, invariant integer strings, no secrets and no
    /// encrypted values. Stripe metadata is a reconciliation aid — the local database stays authoritative and
    /// a missing local snapshot is never reconstructed from it.
    /// </summary>
    private static Dictionary<string, string> BuildMetadata(
        CreateOnlinePaymentProviderSessionRequest request,
        long baseCents,
        long surchargeCents,
        long chargedCents)
    {
        var metadata = new Dictionary<string, string>
        {
            ["order_id"]                = request.OrderId.ToString(),
            ["order_number"]            = request.OrderNumber,
            ["payment_purpose"]         = request.Purpose.ToString(),
            ["base_amount_cents"]       = Invariant(baseCents),
            ["surcharge_amount_cents"]  = Invariant(surchargeCents),
            ["charged_amount_cents"]    = Invariant(chargedCents),
            ["surcharge_rate_bps"]      = Invariant(request.SurchargePercentageBasisPoints),
            ["surcharge_fixed_cents"]   = Invariant(StripeMoney.ToCents(request.SurchargeFixedAmount, "surchargeFixedAmount")),
            ["surcharge_calc_version"]  = request.SurchargeCalculationVersion,
        };

        if (request.PaymentSessionId != Guid.Empty)
            metadata["payment_session_id"] = request.PaymentSessionId.ToString();

        if (request.ProviderMode.HasValue)
            metadata["provider_mode"] = request.ProviderMode.Value.ToString();

        if (!string.IsNullOrWhiteSpace(request.PaymentQuoteFingerprint))
            metadata["quote_fingerprint"] = request.PaymentQuoteFingerprint.Trim();

        return metadata;
    }

    private static Dictionary<string, string> BuildPaymentIntentMetadata(
        CreateOnlinePaymentProviderSessionRequest request,
        long baseCents,
        long surchargeCents,
        long chargedCents)
    {
        var metadata = new Dictionary<string, string>
        {
            ["order_id"]               = request.OrderId.ToString(),
            ["order_number"]           = request.OrderNumber,
            ["base_amount_cents"]      = Invariant(baseCents),
            ["surcharge_amount_cents"] = Invariant(surchargeCents),
            ["charged_amount_cents"]   = Invariant(chargedCents),
        };

        if (request.PaymentSessionId != Guid.Empty)
            metadata["payment_session_id"] = request.PaymentSessionId.ToString();

        if (request.ProviderMode.HasValue)
            metadata["provider_mode"] = request.ProviderMode.Value.ToString();

        return metadata;
    }

    /// <summary>
    /// Idempotency scope (extends Jira 9804). The key distinguishes COMPLETE pricing snapshots, not just the
    /// charged total: the quote fingerprint folds in base, surcharge, rate, fixed fee, calculation version,
    /// disclosure text and Test/Live mode, so two different configurations that happen to charge the same
    /// total get different keys.
    ///
    /// The local payment-session id is deliberately EXCLUDED: it is freshly generated per attempt, and
    /// including it would defeat the 9804 guarantee that a double-click/retry collapses to one Stripe session.
    /// </summary>
    private static string BuildIdempotencyKey(
        CreateOnlinePaymentProviderSessionRequest request,
        long chargedCents,
        string currency)
    {
        var mode = request.ProviderMode?.ToString().ToLowerInvariant() ?? "legacy";

        var fingerprint = string.IsNullOrWhiteSpace(request.PaymentQuoteFingerprint)
            ? "nofp"
            : Truncate(request.PaymentQuoteFingerprint.Trim().ToLowerInvariant(), FingerprintKeySegmentLength);

        var key =
            $"stripe_session_{request.OrderId}_{request.Purpose}_{Invariant(chargedCents)}_{currency}_{mode}_{fingerprint}";

        return Truncate(key, MaxIdempotencyKeyLength);
    }

    private static string Truncate(string value, int maxLength)
        => value.Length <= maxLength ? value : value[..maxLength];

    private static string Invariant(long value) => value.ToString(CultureInfo.InvariantCulture);
    private static string Invariant(int value)  => value.ToString(CultureInfo.InvariantCulture);
}
