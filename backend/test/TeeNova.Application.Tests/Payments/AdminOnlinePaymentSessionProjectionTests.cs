using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using TeeNova.Auth;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;
using TeeNova.Payments;
using Xunit;

namespace TeeNova.Payments.Tests;

public sealed class AdminOnlinePaymentSessionProjectionTests
{
    [Theory]
    [InlineData(PaymentProviderMode.Test)]
    [InlineData(PaymentProviderMode.Live)]
    public void Surcharge_snapshot_maps_explicit_amounts_and_mode(PaymentProviderMode mode)
    {
        var session = SurchargeSession(mode: mode);

        var dto = Project(session);

        Assert.Equal(100.00m, dto.BaseAmount);
        Assert.Equal(3.04m, dto.SurchargeAmount);
        Assert.Equal(session.Amount, dto.ChargedAmount);
        Assert.Equal(103.04m, dto.ChargedAmount);
        Assert.Equal(265, dto.SurchargePercentageBasisPoints);
        Assert.Equal(0.30m, dto.SurchargeFixedAmount);
        Assert.Equal(StripeSurchargeCalculator.CurrentCalculationVersion, dto.SurchargeCalculationVersion);
        Assert.Equal(mode, dto.ProviderMode);
    }

    [Fact]
    public void Legacy_session_remains_unknown_mode_and_no_surcharge()
    {
        var session = LegacySession();

        var dto = Project(session);

        Assert.Equal(dto.BaseAmount, dto.ChargedAmount);
        Assert.Equal(0m, dto.SurchargeAmount);
        Assert.Null(dto.ProviderMode);
        Assert.Equal(OnlinePaymentSession.LegacyCalculationVersion, dto.SurchargeCalculationVersion);
    }

    [Fact]
    public void Completed_linked_commercial_transaction_is_reconciled()
    {
        var transaction = Transaction(100m);
        var session = SurchargeSession();
        session.MarkCompleted("pi_1", "evt_1", "paid", transaction.Id, DateTime.UtcNow);

        var dto = Project(session, new[] { transaction });

        Assert.Equal(AdminPaymentReconciliationStatus.Reconciled, dto.ReconciliationStatus);
        Assert.Equal(transaction.Id, dto.PaymentTransactionId);
        Assert.Equal(100m, dto.CommercialTransactionAmount);
    }

    [Theory]
    [InlineData(OnlinePaymentSessionStatus.Pending, AdminPaymentReconciliationStatus.Pending)]
    [InlineData(OnlinePaymentSessionStatus.Cancelled, AdminPaymentReconciliationStatus.Cancelled)]
    [InlineData(OnlinePaymentSessionStatus.Expired, AdminPaymentReconciliationStatus.Expired)]
    [InlineData(OnlinePaymentSessionStatus.Failed, AdminPaymentReconciliationStatus.Failed)]
    public void Ordinary_lifecycle_status_maps_without_false_review(
        OnlinePaymentSessionStatus sessionStatus,
        AdminPaymentReconciliationStatus expected)
    {
        var session = SurchargeSession();
        if (sessionStatus == OnlinePaymentSessionStatus.Cancelled) session.MarkCancelled();
        if (sessionStatus == OnlinePaymentSessionStatus.Expired) session.MarkExpired();
        if (sessionStatus == OnlinePaymentSessionStatus.Failed) session.MarkFailed();

        Assert.Equal(expected, Project(session).ReconciliationStatus);
    }

    [Fact]
    public void Manual_review_webhook_maps_safe_reason_and_observed_values()
    {
        var session = SurchargeSession();
        var webhook = PaymentWebhookEvent.Create(
            Guid.NewGuid(), PaymentProvider.Stripe, "evt_review", "checkout.session.completed",
            session.ProviderSessionId, "pi_review", 99m, "nzd", DateTime.UtcNow);
        webhook.MarkRequiresManualReview(
            "TeeNova:Payment:WebhookAmountMismatch", "raw internal detail", DateTime.UtcNow,
            session.OrderId, session.Id);

        var dto = Project(session, webhookEvents: new[] { webhook });

        Assert.Equal(AdminPaymentReconciliationStatus.RequiresReview, dto.ReconciliationStatus);
        Assert.Equal("Amount received from the provider did not match the stored total.", dto.ReconciliationMessage);
        Assert.Equal(99m, dto.ObservedProviderAmount);
        Assert.Equal("evt_review", dto.ProviderEventId);
        Assert.DoesNotContain("raw internal detail", dto.ReconciliationMessage);
    }

    [Fact]
    public void Completed_without_transaction_requires_review()
    {
        var session = SurchargeSession();
        session.MarkCompleted("pi", "evt", "paid", Guid.NewGuid(), DateTime.UtcNow);

        Assert.Equal(AdminPaymentReconciliationStatus.RequiresReview, Project(session).ReconciliationStatus);
    }

    [Fact]
    public void Commercial_transaction_mismatch_requires_review()
    {
        var transaction = Transaction(99m);
        var session = SurchargeSession();
        session.MarkCompleted("pi", "evt", "paid", transaction.Id, DateTime.UtcNow);

        var dto = Project(session, new[] { transaction });

        Assert.Equal(AdminPaymentReconciliationStatus.RequiresReview, dto.ReconciliationStatus);
        Assert.Contains("commercial transaction amount", dto.ReconciliationMessage);
    }

    [Fact]
    public void Corrupt_snapshot_invariant_requires_review_without_repair()
    {
        var session = SurchargeSession();
        SetPrivate(session, nameof(OnlinePaymentSession.SurchargeAmount), 1m);

        var dto = Project(session);

        Assert.Equal(AdminPaymentReconciliationStatus.RequiresReview, dto.ReconciliationStatus);
        Assert.Equal(103.04m, dto.ChargedAmount);
        Assert.Equal(1m, dto.SurchargeAmount);
    }

    [Fact]
    public void Unsupported_version_and_missing_surcharge_mode_require_review()
    {
        var unsupported = SurchargeSession();
        SetPrivate(unsupported, nameof(OnlinePaymentSession.SurchargeCalculationVersion), "future-v2");
        var noMode = SurchargeSession();
        SetPrivate<PaymentProviderMode?>(noMode, nameof(OnlinePaymentSession.ProviderMode), null);

        Assert.Equal(AdminPaymentReconciliationStatus.RequiresReview, Project(unsupported).ReconciliationStatus);
        Assert.Equal(AdminPaymentReconciliationStatus.RequiresReview, Project(noMode).ReconciliationStatus);
    }

    [Fact]
    public void Multiple_attempts_are_distinct_and_newest_first()
    {
        var older = SurchargeSession(id: Guid.Parse("00000000-0000-0000-0000-000000000001"));
        var newer = SurchargeSession(id: Guid.Parse("00000000-0000-0000-0000-000000000002"));
        SetPrivate(older, nameof(OnlinePaymentSession.CreationTime), new DateTime(2026, 1, 1));
        SetPrivate(newer, nameof(OnlinePaymentSession.CreationTime), new DateTime(2026, 1, 2));
        older.MarkFailed();

        var result = AdminOnlinePaymentSessionProjection.Build(new[] { older, newer }, Array.Empty<PaymentTransaction>(), Array.Empty<PaymentWebhookEvent>());

        Assert.Equal(newer.Id, result[0].Id);
        Assert.Equal(older.Id, result[1].Id);
        Assert.Equal(2, result.Select(x => x.Id).Distinct().Count());
    }

    [Fact]
    public void Admin_contract_and_endpoint_are_secret_free_and_role_guarded()
    {
        var names = typeof(AdminOnlinePaymentSessionDto).GetProperties().Select(p => p.Name).ToArray();
        Assert.DoesNotContain(names, n => n.Contains("Secret", StringComparison.OrdinalIgnoreCase)
            || n.Contains("Cipher", StringComparison.OrdinalIgnoreCase)
            || n.Contains("Payload", StringComparison.OrdinalIgnoreCase)
            || n.Contains("CheckoutUrl", StringComparison.OrdinalIgnoreCase));
        Assert.Null(typeof(OrderDto).GetProperty("OnlinePaymentSessions"));

        var controllerAuth = typeof(AdminOrderController).GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal(TeeNovaRoles.Admin, controllerAuth?.Roles);
        var serviceMethod = typeof(OrderAppService).GetMethod(nameof(OrderAppService.GetAdminOnlinePaymentSessionsAsync))!;
        Assert.Equal(TeeNovaRoles.Admin, serviceMethod.GetCustomAttribute<AuthorizeAttribute>()?.Roles);
    }

    private static AdminOnlinePaymentSessionDto Project(
        OnlinePaymentSession session,
        IEnumerable<PaymentTransaction>? transactions = null,
        IEnumerable<PaymentWebhookEvent>? webhookEvents = null)
        => Assert.Single(AdminOnlinePaymentSessionProjection.Build(
            new[] { session },
            transactions ?? Array.Empty<PaymentTransaction>(),
            webhookEvents ?? Array.Empty<PaymentWebhookEvent>()));

    private static OnlinePaymentSession SurchargeSession(
        Guid? id = null,
        PaymentProviderMode mode = PaymentProviderMode.Test)
        => OnlinePaymentSession.CreateWithPaymentSnapshot(
            id ?? Guid.NewGuid(), OrderId, "ORD-1", PaymentProvider.Stripe, $"cs_{Guid.NewGuid():N}",
            "https://checkout.stripe.test/session", "NZD", PaymentPurpose.FullPayment,
            100m, 3.04m, 103.04m, 265, 0.30m,
            StripeSurchargeCalculator.CurrentCalculationVersion, mode);

    private static OnlinePaymentSession LegacySession()
        => OnlinePaymentSession.Create(
            Guid.NewGuid(), OrderId, "ORD-1", PaymentProvider.Stripe, "cs_legacy",
            "https://checkout.stripe.test/legacy", 100m, "NZD", PaymentPurpose.FullPayment);

    private static PaymentTransaction Transaction(decimal amount)
        => new(Guid.NewGuid(), OrderId, amount, ManualPaymentMethod.Online, "stripe", "commercial");

    private static void SetPrivate<T>(OnlinePaymentSession session, string property, T value)
        => typeof(OnlinePaymentSession).GetProperty(property)!.SetValue(session, value);

    private static readonly Guid OrderId = Guid.Parse("11111111-1111-1111-1111-111111111111");
}
