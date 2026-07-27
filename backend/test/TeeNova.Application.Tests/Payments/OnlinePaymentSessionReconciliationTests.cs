using System;
using TeeNova.Orders;

namespace TeeNova.Payments;

/// <summary>
/// Webhook reconciliation and the commercial accounting boundary (Phase 3):
/// the provider's charged total is compared against <c>Session.Amount</c>, while only
/// <c>Session.BaseAmount</c> ever reaches the order and the commercial payment transaction.
/// </summary>
public sealed class OnlinePaymentSessionReconciliationTests
{
    // ── Charged-total vs commercial amount ────────────────────────────────────

    [Fact]
    public void Canonical_payment_compares_the_charged_total_but_applies_only_the_base()
    {
        var session = SurchargeSession(baseAmount: 100.00m, surcharge: 3.04m, charged: 103.04m);

        // What Stripe charged the card:
        Assert.Equal(103.04m, session.Amount);
        Assert.Equal(103.04m, session.ChargedAmount);

        // What may touch the order and the PaymentTransaction:
        Assert.Equal(100.00m, OnlinePaymentSessionReconciliation.CommercialAmount(session));

        // What stays recorded on the session only:
        Assert.Equal(3.04m, session.SurchargeAmount);
    }

    [Fact]
    public void Legacy_session_applies_its_full_amount()
    {
        var session = LegacySession(120.50m);

        Assert.Equal(120.50m, session.Amount);
        Assert.Equal(120.50m, OnlinePaymentSessionReconciliation.CommercialAmount(session));
        Assert.Equal(0m,      session.SurchargeAmount);
        Assert.True(OnlinePaymentSessionReconciliation.IsLegacy(session));
        Assert.False(OnlinePaymentSessionReconciliation.IsSurchargeAware(session));
    }

    // ── Snapshot validation ───────────────────────────────────────────────────

    [Fact]
    public void Valid_surcharge_aware_session_in_the_matching_mode_passes()
    {
        var session = SurchargeSession(mode: PaymentProviderMode.Test);

        Assert.Null(OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Test));
    }

    [Fact]
    public void Valid_legacy_session_passes_with_any_observed_mode()
    {
        var session = LegacySession(50.00m);

        Assert.Null(OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Live));
        Assert.Null(OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Test));
        Assert.Null(OnlinePaymentSessionReconciliation.ValidateSnapshot(session, null));

        // Nothing is inferred or written for a legacy session's unknown historical mode.
        Assert.Null(session.ProviderMode);
    }

    [Fact]
    public void Test_live_mismatch_requires_manual_review()
    {
        var session = SurchargeSession(mode: PaymentProviderMode.Test);

        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Live);

        Assert.NotNull(failure);
        Assert.Equal(OnlinePaymentSessionReconciliation.ModeMismatchCode, failure!.Code);
    }

    [Fact]
    public void Surcharge_aware_session_with_a_null_mode_requires_manual_review()
    {
        var session = SurchargeSession();
        SetPrivate(session, nameof(OnlinePaymentSession.ProviderMode), null);

        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Test);

        Assert.NotNull(failure);
        Assert.Equal(OnlinePaymentSessionReconciliation.ModeMissingCode, failure!.Code);
    }

    [Fact]
    public void Broken_base_plus_surcharge_identity_requires_manual_review()
    {
        var session = SurchargeSession();
        SetPrivate(session, nameof(OnlinePaymentSession.SurchargeAmount), 5.00m);

        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Test);

        Assert.NotNull(failure);
        Assert.Equal(OnlinePaymentSessionReconciliation.SnapshotInvalidCode, failure!.Code);
    }

    [Fact]
    public void Non_cent_aligned_snapshot_requires_manual_review()
    {
        var session = LegacySession(100.00m);
        SetPrivate(session, nameof(OnlinePaymentSession.BaseAmount), 100.0049m);
        SetPrivate(session, nameof(OnlinePaymentSession.Amount),     100.0049m);

        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, null);

        Assert.NotNull(failure);
        Assert.Equal(OnlinePaymentSessionReconciliation.SnapshotInvalidCode, failure!.Code);
    }

    [Fact]
    public void Unsupported_calculation_version_requires_manual_review()
    {
        var session = LegacySession(100.00m);
        SetPrivate(session, nameof(OnlinePaymentSession.SurchargeCalculationVersion), "stripe-gross-up-v9");

        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Test);

        Assert.NotNull(failure);
        Assert.Equal(OnlinePaymentSessionReconciliation.VersionUnsupportedCode, failure!.Code);
    }

    [Fact]
    public void Legacy_session_carrying_a_surcharge_requires_manual_review()
    {
        var session = LegacySession(100.00m);
        SetPrivate(session, nameof(OnlinePaymentSession.SurchargeAmount), 3.04m);
        SetPrivate(session, nameof(OnlinePaymentSession.Amount),          103.04m);

        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, null);

        Assert.NotNull(failure);
        Assert.Equal(OnlinePaymentSessionReconciliation.SnapshotInvalidCode, failure!.Code);
    }

    [Fact]
    public void Failure_messages_carry_no_card_data_or_raw_payload()
    {
        var session = SurchargeSession(mode: PaymentProviderMode.Test);
        var failure = OnlinePaymentSessionReconciliation.ValidateSnapshot(session, PaymentProviderMode.Live);

        Assert.NotNull(failure);
        Assert.StartsWith("TeeNova:Payment:", failure!.Code);
        Assert.DoesNotContain("sk_", failure.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("{",   failure.Message, StringComparison.Ordinal);
    }

    // ── Commercial thresholds against the real Order aggregate ────────────────

    [Fact]
    public void Full_payment_threshold_is_met_by_the_base_amount_not_the_charged_total()
    {
        var order   = Order.CreateDraftForPaymentQuote(100.00m, DeliveryMethod.Shipping);
        var session = SurchargeSession(baseAmount: 100.00m, surcharge: 3.04m, charged: 103.04m);

        order.ApplyPayment(
            OnlinePaymentSessionReconciliation.CommercialAmount(session),
            ManualPaymentMethod.Online, "pi_1", "Online payment via Stripe.", DateTime.UtcNow);

        Assert.Equal(100.00m, order.PaidAmount);
        Assert.Equal(0m,      order.BalanceAmount);
        Assert.Equal(PaymentStatus.Paid, order.PaymentStatus);

        // The surcharge never inflates order money.
        Assert.Equal(100.00m, order.TotalAmount);
        Assert.Equal(100.00m, order.RequiredPaymentAmount);

        order.Activate(DateTime.UtcNow);
        Assert.Equal(OrderStatus.Paid, order.Status);
    }

    [Fact]
    public void Deposit_threshold_is_met_by_the_base_amount_not_the_charged_total()
    {
        var order = Order.CreateDraftForPaymentQuote(200.00m, DeliveryMethod.Pickup);
        Assert.Equal(100.00m, order.RequiredDepositAmount);

        var session = SurchargeSession(baseAmount: 100.00m, surcharge: 3.04m, charged: 103.04m);

        order.ApplyPayment(
            OnlinePaymentSessionReconciliation.CommercialAmount(session),
            ManualPaymentMethod.Online, "pi_1", "Online payment via Stripe.", DateTime.UtcNow);

        Assert.Equal(100.00m, order.PaidAmount);
        Assert.Equal(100.00m, order.BalanceAmount);
        Assert.Equal(PaymentStatus.DepositPaid, order.PaymentStatus);

        order.Activate(DateTime.UtcNow);
        Assert.Equal(OrderStatus.Paid, order.Status);
    }

    [Fact]
    public void Applying_the_charged_total_would_overpay_the_order()
    {
        var order   = Order.CreateDraftForPaymentQuote(100.00m, DeliveryMethod.Shipping);
        var session = SurchargeSession(baseAmount: 100.00m, surcharge: 3.04m, charged: 103.04m);

        // This is precisely the regression the Phase 3 boundary prevents: the charged total exceeds the
        // commercial balance, so a charged-total comparison would reject every surcharged payment.
        Assert.True(session.Amount > order.BalanceAmount);
        Assert.False(OnlinePaymentSessionReconciliation.CommercialAmount(session) > order.BalanceAmount);
    }

    [Fact]
    public void A_commercial_payment_transaction_records_only_the_base_amount()
    {
        var session     = SurchargeSession(baseAmount: 100.00m, surcharge: 3.04m, charged: 103.04m);
        var transaction = new PaymentTransaction(
            Guid.NewGuid(), Guid.NewGuid(),
            OnlinePaymentSessionReconciliation.CommercialAmount(session),
            ManualPaymentMethod.Online, "pi_1", "Online payment via Stripe.");

        Assert.Equal(100.00m, transaction.Amount);
        Assert.NotEqual(session.Amount, transaction.Amount);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static OnlinePaymentSession SurchargeSession(
        decimal             baseAmount = 100.00m,
        decimal             surcharge  = 3.04m,
        decimal             charged    = 103.04m,
        PaymentProviderMode mode       = PaymentProviderMode.Test)
        => OnlinePaymentSession.CreateWithPaymentSnapshot(
            Guid.NewGuid(), Guid.NewGuid(), "ORD-1", PaymentProvider.Stripe,
            "cs_test_1", "https://checkout.stripe.test/c/1", "NZD", PaymentPurpose.FullPayment,
            baseAmount, surcharge, charged, 265, 0.30m,
            StripeSurchargeDefaults.CalculationVersion, mode);

    private static OnlinePaymentSession LegacySession(decimal amount)
        => OnlinePaymentSession.Create(
            Guid.NewGuid(), Guid.NewGuid(), "ORD-1", PaymentProvider.Stripe,
            "cs_test_legacy", "https://checkout.stripe.test/c/legacy",
            amount, "NZD", PaymentPurpose.FullPayment);

    private static void SetPrivate(OnlinePaymentSession session, string property, object? value)
        => typeof(OnlinePaymentSession)
            .GetProperty(property)!
            .GetSetMethod(nonPublic: true)!
            .Invoke(session, new[] { value });
}
