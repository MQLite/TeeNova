using System;
using System.Linq;
using TeeNova.Payments.Stripe;
using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// Stripe Checkout representation (Phase 3), asserted against the real <c>SessionCreateOptions</c> object the
/// provider would send. Pure option construction — no Stripe credentials, no network call, no API-version
/// override and no preview API.
/// </summary>
public sealed class StripeCheckoutSessionOptionsBuilderTests
{
    private static readonly Guid OrderId   = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid SessionId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    // ── Enabled surcharge ─────────────────────────────────────────────────────

    [Fact]
    public void Enabled_surcharge_creates_two_line_items_summing_to_the_charged_total()
    {
        var plan = Build(Surcharged());

        Assert.Equal(2, plan.Options.LineItems.Count);

        var baseLine      = plan.Options.LineItems[0];
        var surchargeLine = plan.Options.LineItems[1];

        Assert.Equal(10_000, baseLine.PriceData.UnitAmount);
        Assert.Equal(304,    surchargeLine.PriceData.UnitAmount);
        Assert.Equal(1,      baseLine.Quantity);
        Assert.Equal(1,      surchargeLine.Quantity);

        Assert.Equal(
            10_304,
            plan.Options.LineItems.Sum(l => l.PriceData.UnitAmount!.Value * l.Quantity!.Value));
    }

    [Fact]
    public void Surcharge_line_uses_the_exact_product_wording()
    {
        var plan = Build(Surcharged());

        Assert.Equal("Card processing surcharge", plan.Options.LineItems[1].PriceData.ProductData.Name);
        Assert.Equal("Card processing surcharge", StripeCheckoutSessionOptionsBuilder.SurchargeLineItemName);
    }

    [Fact]
    public void Base_line_keeps_the_existing_order_label()
        => Assert.Equal("Order #ORD-1001", Build(Surcharged()).Options.LineItems[0].PriceData.ProductData.Name);

    [Fact]
    public void Enabled_surcharge_is_card_only()
    {
        var plan = Build(Surcharged());

        Assert.NotNull(plan.Options.PaymentMethodTypes);
        Assert.Equal(new[] { "card" }, plan.Options.PaymentMethodTypes.ToArray());
    }

    [Fact]
    public void Enabled_zero_fee_omits_the_zero_line_but_keeps_the_surcharge_contract()
    {
        var request = Surcharged();
        request.SurchargeAmount                = 0m;
        request.Amount                         = 100.00m;
        request.SurchargePercentageBasisPoints = 0;
        request.SurchargeFixedAmount           = 0m;

        var plan = Build(request);

        Assert.Single(plan.Options.LineItems);
        Assert.Equal(10_000, plan.Options.LineItems[0].PriceData.UnitAmount);

        // Still surcharge-aware: card-only, full metadata, mode recorded.
        Assert.Equal(new[] { "card" }, plan.Options.PaymentMethodTypes.ToArray());
        Assert.Equal("0", plan.Options.Metadata["surcharge_amount_cents"]);
        Assert.Equal("Test", plan.Options.Metadata["provider_mode"]);
    }

    // ── Disabled surcharge (legacy behaviour) ─────────────────────────────────

    [Fact]
    public void Disabled_surcharge_preserves_the_single_line_item()
    {
        var plan = Build(Legacy());

        Assert.Single(plan.Options.LineItems);
        Assert.Equal(10_000, plan.Options.LineItems[0].PriceData.UnitAmount);
        Assert.Equal("Order #ORD-1001", plan.Options.LineItems[0].PriceData.ProductData.Name);
    }

    [Fact]
    public void Disabled_surcharge_preserves_existing_payment_method_behaviour()
        => Assert.Null(Build(Legacy()).Options.PaymentMethodTypes);

    [Fact]
    public void Disabled_surcharge_keeps_the_charged_total_on_the_single_line()
    {
        var request = Legacy();
        request.Amount = 250.75m;

        Assert.Equal(25_075, Build(request).Options.LineItems[0].PriceData.UnitAmount);
    }

    // ── Metadata ──────────────────────────────────────────────────────────────

    [Fact]
    public void Session_metadata_is_complete_and_invariant_culture()
    {
        var metadata = Build(Surcharged()).Options.Metadata;

        Assert.Equal(OrderId.ToString(), metadata["order_id"]);
        Assert.Equal("ORD-1001",         metadata["order_number"]);
        Assert.Equal("FullPayment",      metadata["payment_purpose"]);
        Assert.Equal("10000",            metadata["base_amount_cents"]);
        Assert.Equal("304",              metadata["surcharge_amount_cents"]);
        Assert.Equal("10304",            metadata["charged_amount_cents"]);
        Assert.Equal("265",              metadata["surcharge_rate_bps"]);
        Assert.Equal("30",               metadata["surcharge_fixed_cents"]);
        Assert.Equal(StripeSurchargeDefaults.CalculationVersion, metadata["surcharge_calc_version"]);
        Assert.Equal("Test",             metadata["provider_mode"]);
        Assert.Equal(SessionId.ToString(), metadata["payment_session_id"]);
        Assert.Equal("fingerprint-abc",  metadata["quote_fingerprint"]);

        // Invariant integer strings only — no separators, no localised decimal marks.
        Assert.All(
            new[] { "base_amount_cents", "surcharge_amount_cents", "charged_amount_cents",
                    "surcharge_rate_bps", "surcharge_fixed_cents" },
            key => Assert.Matches("^[0-9]+$", metadata[key]));
    }

    [Fact]
    public void Payment_intent_metadata_carries_the_correlation_data()
    {
        var metadata = Build(Surcharged()).Options.PaymentIntentData.Metadata;

        Assert.Equal(OrderId.ToString(),   metadata["order_id"]);
        Assert.Equal("ORD-1001",           metadata["order_number"]);
        Assert.Equal(SessionId.ToString(), metadata["payment_session_id"]);
        Assert.Equal("10000",              metadata["base_amount_cents"]);
        Assert.Equal("304",                metadata["surcharge_amount_cents"]);
        Assert.Equal("10304",              metadata["charged_amount_cents"]);
        Assert.Equal("Test",               metadata["provider_mode"]);
    }

    [Fact]
    public void Metadata_contains_no_secret_material()
    {
        var request = Surcharged();
        request.Metadata["ignored_by_stripe_builder"] = "sk_test_should_never_be_forwarded";

        var plan = Build(request);
        var all  = string.Join("|", plan.Options.Metadata.Values)
                 + "|" + string.Join("|", plan.Options.PaymentIntentData.Metadata.Values);

        Assert.DoesNotContain("sk_test", all, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("whsec",   all, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sk_live", all, StringComparison.OrdinalIgnoreCase);
    }

    // ── Idempotency ───────────────────────────────────────────────────────────

    [Fact]
    public void The_same_snapshot_produces_the_same_idempotency_key()
        => Assert.Equal(Build(Surcharged()).IdempotencyKey, Build(Surcharged()).IdempotencyKey);

    [Fact]
    public void A_changed_snapshot_fingerprint_changes_the_idempotency_key()
    {
        var changed = Surcharged();
        changed.PaymentQuoteFingerprint = "fingerprint-xyz";

        Assert.NotEqual(Build(Surcharged()).IdempotencyKey, Build(changed).IdempotencyKey);
    }

    [Fact]
    public void A_changed_mode_changes_the_idempotency_key()
    {
        var live = Surcharged();
        live.ProviderMode = PaymentProviderMode.Live;

        Assert.NotEqual(Build(Surcharged()).IdempotencyKey, Build(live).IdempotencyKey);
    }

    [Fact]
    public void The_idempotency_key_is_independent_of_the_local_session_id()
    {
        var other = Surcharged();
        other.PaymentSessionId = Guid.NewGuid();

        // Two concurrent attempts for the SAME pricing snapshot must still collapse to one Stripe session.
        Assert.Equal(Build(Surcharged()).IdempotencyKey, Build(other).IdempotencyKey);
    }

    [Fact]
    public void The_idempotency_key_stays_within_stripe_limits()
        => Assert.InRange(Build(Surcharged()).IdempotencyKey.Length, 1, 255);

    // ── Snapshot integrity ────────────────────────────────────────────────────

    [Fact]
    public void An_inconsistent_snapshot_is_rejected_before_any_option_is_built()
    {
        var request = Surcharged();
        request.Amount = 200.00m; // no longer base + surcharge

        var ex = Assert.Throws<BusinessException>(() => Build(request));
        Assert.Equal("TeeNova:Payment:StripeSnapshotAmountMismatch", ex.Code);
    }

    [Fact]
    public void A_surcharge_without_an_enabled_flag_is_rejected()
    {
        var request = Legacy();
        request.SurchargeAmount = 3.04m;
        request.Amount          = 103.04m;

        var ex = Assert.Throws<BusinessException>(() => Build(request));
        Assert.Equal("TeeNova:Payment:StripeSnapshotAmountMismatch", ex.Code);
    }

    [Fact]
    public void Fractional_cent_amounts_are_rejected()
    {
        var request = Legacy();
        request.Amount = 100.001m;

        var ex = Assert.Throws<BusinessException>(() => Build(request));
        Assert.Equal("TeeNova:Payment:StripeAmountPrecisionInvalid", ex.Code);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static StripeCheckoutSessionPlan Build(CreateOnlinePaymentProviderSessionRequest request)
        => StripeCheckoutSessionOptionsBuilder.Build(request);

    private static CreateOnlinePaymentProviderSessionRequest Legacy() => new()
    {
        OrderId          = OrderId,
        OrderNumber      = "ORD-1001",
        Provider         = PaymentProvider.Stripe,
        Purpose          = PaymentPurpose.FullPayment,
        Amount           = 100.00m,
        Currency         = "NZD",
        CustomerEmail    = "customer@example.test",
        SuccessUrl       = "https://example.test/checkout/success",
        CancelUrl        = "https://example.test/checkout/cancel",
        PaymentSessionId = SessionId,
    };

    private static CreateOnlinePaymentProviderSessionRequest Surcharged()
    {
        var request = Legacy();

        request.Amount                         = 103.04m;
        request.BaseAmount                     = 100.00m;
        request.SurchargeAmount                = 3.04m;
        request.SurchargeEnabled               = true;
        request.SurchargePercentageBasisPoints = 265;
        request.SurchargeFixedAmount           = 0.30m;
        request.SurchargeCalculationVersion    = StripeSurchargeDefaults.CalculationVersion;
        request.ProviderMode                   = PaymentProviderMode.Test;
        request.PaymentQuoteFingerprint        = "fingerprint-abc";

        return request;
    }
}
