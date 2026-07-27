using System.Reflection;

namespace TeeNova.Payments;

/// <summary>
/// Covers the immutable payment-session pricing snapshot (Phase 2B): legacy construction stays a
/// no-surcharge session, the surcharge-aware factory enforces the Phase 3 invariants, and no lifecycle
/// transition or public setter can rewrite a snapshot after construction. Pure domain — no database.
/// </summary>
public sealed class OnlinePaymentSessionSnapshotTests
{
    private const string SurchargeVersion = StripeSurchargeDefaults.CalculationVersion;
    private const string LegacyVersion    = StripeSurchargeDefaults.LegacyCalculationVersion;

    // ── Legacy construction ───────────────────────────────────────────────────

    [Fact]
    public void Legacy_factory_stamps_a_no_surcharge_snapshot()
    {
        var session = CreateLegacy(250.75m);

        Assert.Equal(250.75m, session.Amount);
        Assert.Equal(250.75m, session.BaseAmount);
        Assert.Equal(0m,      session.SurchargeAmount);
        Assert.Equal(0,       session.SurchargePercentageBasisPoints);
        Assert.Equal(0m,      session.SurchargeFixedAmount);
        Assert.Equal(LegacyVersion, session.SurchargeCalculationVersion);
        Assert.Null(session.ProviderMode);

        Assert.Equal(session.Amount, session.BaseAmount + session.SurchargeAmount);
        Assert.Equal(session.Amount, session.ChargedAmount);
    }

    [Fact]
    public void Legacy_factory_preserves_existing_public_behaviour()
    {
        var session = CreateLegacy(120m);

        Assert.Equal(OnlinePaymentSessionStatus.Pending, session.Status);
        Assert.Equal(PaymentProvider.Stripe, session.Provider);
        Assert.Equal(PaymentPurpose.FullPayment, session.Purpose);
        Assert.Equal("NZD", session.Currency);
        Assert.Null(session.CompletedAt);
        Assert.Null(session.ProviderPaymentId);
        Assert.Null(session.LastProviderEventId);
        Assert.Null(session.RawProviderStatus);
        Assert.Null(session.PaymentTransactionId);
    }

    // ── Surcharge-aware construction ──────────────────────────────────────────

    [Theory]
    [InlineData(PaymentProviderMode.Test)]
    [InlineData(PaymentProviderMode.Live)]
    public void Canonical_surcharge_snapshot_is_preserved_exactly(PaymentProviderMode mode)
    {
        var session = CreateSnapshot(
            baseAmount: 100.00m,
            surchargeAmount: 3.04m,
            chargedAmount: 103.04m,
            basisPoints: 265,
            fixedAmount: 0.30m,
            providerMode: mode);

        Assert.Equal(100.00m, session.BaseAmount);
        Assert.Equal(3.04m,   session.SurchargeAmount);
        Assert.Equal(103.04m, session.Amount);
        Assert.Equal(103.04m, session.ChargedAmount);
        Assert.Equal(265,     session.SurchargePercentageBasisPoints);
        Assert.Equal(0.30m,   session.SurchargeFixedAmount);
        Assert.Equal(SurchargeVersion, session.SurchargeCalculationVersion);
        Assert.Equal(mode, session.ProviderMode);
        Assert.Equal(OnlinePaymentSessionStatus.Pending, session.Status);
    }

    [Fact]
    public void Canonical_snapshot_matches_the_frozen_phase_1_calculation()
    {
        var calculated = StripeSurchargeCalculator.Calculate(
            baseAmountCents: 10_000,
            percentageBasisPoints: StripeSurchargeDefaults.PercentageBasisPoints,
            fixedFeeCents: 30,
            enabled: true);

        var session = CreateSnapshot(
            baseAmount: calculated.BaseAmountCents / 100m,
            surchargeAmount: calculated.SurchargeAmountCents / 100m,
            chargedAmount: calculated.ChargedAmountCents / 100m,
            basisPoints: calculated.PercentageBasisPoints,
            fixedAmount: calculated.FixedFeeCents / 100m);

        Assert.Equal(100.00m, session.BaseAmount);
        Assert.Equal(3.04m,   session.SurchargeAmount);
        Assert.Equal(103.04m, session.Amount);
    }

    // ── Amount invariant ──────────────────────────────────────────────────────

    [Theory]
    [InlineData(103.03)] // under-total
    [InlineData(103.05)] // over-total
    public void Charged_amount_must_equal_base_plus_surcharge(decimal chargedAmount)
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(
            baseAmount: 100.00m, surchargeAmount: 3.04m, chargedAmount: chargedAmount));
    }

    // ── Base / surcharge validation ───────────────────────────────────────────

    [Theory]
    [InlineData(0)]
    [InlineData(-100.00)]
    public void Base_amount_must_be_greater_than_zero(decimal baseAmount)
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(
            baseAmount: baseAmount, surchargeAmount: 0m, chargedAmount: baseAmount));
    }

    [Fact]
    public void Negative_surcharge_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(
            baseAmount: 100.00m, surchargeAmount: -1.00m, chargedAmount: 99.00m));
    }

    [Fact]
    public void Zero_surcharge_is_valid_on_a_surcharge_aware_snapshot()
    {
        var session = CreateSnapshot(
            baseAmount: 100.00m,
            surchargeAmount: 0m,
            chargedAmount: 100.00m,
            basisPoints: 0,
            fixedAmount: 0m);

        Assert.Equal(0m, session.SurchargeAmount);
        Assert.Equal(100.00m, session.Amount);
        Assert.Equal(SurchargeVersion, session.SurchargeCalculationVersion);
        Assert.Equal(PaymentProviderMode.Test, session.ProviderMode);
    }

    // ── Cent alignment (each field independently) ─────────────────────────────

    [Fact]
    public void Non_cent_aligned_base_amount_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(
            baseAmount: 100.001m, surchargeAmount: 3.04m, chargedAmount: 103.041m));
    }

    [Fact]
    public void Non_cent_aligned_surcharge_amount_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(
            baseAmount: 100.00m, surchargeAmount: 3.045m, chargedAmount: 103.045m));
    }

    [Fact]
    public void Non_cent_aligned_charged_amount_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(
            baseAmount: 100.00m, surchargeAmount: 3.04m, chargedAmount: 103.045m));
    }

    [Fact]
    public void Non_cent_aligned_fixed_amount_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(fixedAmount: 0.305m));
    }

    // ── Rate and fixed-fee validation ─────────────────────────────────────────

    [Theory]
    [InlineData(-1)]
    [InlineData(10_000)]
    [InlineData(10_001)]
    public void Out_of_range_basis_points_are_rejected(int basisPoints)
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(basisPoints: basisPoints));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(265)]
    [InlineData(9_999)]
    public void In_range_basis_points_are_accepted(int basisPoints)
    {
        var session = CreateSnapshot(basisPoints: basisPoints);

        Assert.Equal(basisPoints, session.SurchargePercentageBasisPoints);
    }

    [Fact]
    public void Negative_fixed_amount_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(fixedAmount: -0.30m));
    }

    // ── Calculation version validation ────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("stripe-gross-up-v2")]
    [InlineData("legacy-no-surcharge")]
    public void Unsupported_calculation_versions_are_rejected(string? version)
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(version: version!));
    }

    // ── Provider mode ─────────────────────────────────────────────────────────

    [Fact]
    public void Undefined_provider_mode_is_rejected()
    {
        Assert.ThrowsAny<ArgumentException>(() => CreateSnapshot(providerMode: (PaymentProviderMode)99));
    }

    [Fact]
    public void Surcharge_aware_creation_cannot_omit_a_provider_mode()
    {
        var parameter = typeof(OnlinePaymentSession)
            .GetMethod(nameof(OnlinePaymentSession.CreateWithPaymentSnapshot), BindingFlags.Public | BindingFlags.Static)!
            .GetParameters()
            .Single(p => p.Name == "providerMode");

        // A non-nullable enum parameter with no default makes "surcharge snapshot without a mode"
        // unrepresentable, so a positive surcharge can never coexist with a null ProviderMode.
        Assert.Equal(typeof(PaymentProviderMode), parameter.ParameterType);
        Assert.False(parameter.IsOptional);
    }

    [Fact]
    public void Legacy_creation_leaves_the_provider_mode_unset()
    {
        Assert.Null(CreateLegacy(75.50m).ProviderMode);
    }

    // ── Legacy consistency ────────────────────────────────────────────────────

    [Fact]
    public void Only_two_public_creation_paths_exist()
    {
        var factories = typeof(OnlinePaymentSession)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Where(m => m.ReturnType == typeof(OnlinePaymentSession))
            .Select(m => m.Name)
            .OrderBy(n => n)
            .ToArray();

        Assert.Equal(
            new[] { nameof(OnlinePaymentSession.Create), nameof(OnlinePaymentSession.CreateWithPaymentSnapshot) },
            factories);

        Assert.Empty(typeof(OnlinePaymentSession)
            .GetConstructors(BindingFlags.Public | BindingFlags.Instance));
    }

    [Theory]
    [InlineData(0.01)]
    [InlineData(103.04)]
    [InlineData(9_999.99)]
    public void Legacy_version_always_carries_zero_surcharge_configuration(decimal amount)
    {
        var session = CreateLegacy(amount);

        Assert.Equal(LegacyVersion, session.SurchargeCalculationVersion);
        Assert.Equal(0m, session.SurchargeAmount);
        Assert.Equal(0,  session.SurchargePercentageBasisPoints);
        Assert.Equal(0m, session.SurchargeFixedAmount);
        Assert.Equal(amount, session.BaseAmount);
    }

    [Fact]
    public void Surcharge_aware_path_never_stamps_the_legacy_version()
    {
        Assert.Equal(SurchargeVersion, CreateSnapshot().SurchargeCalculationVersion);
    }

    // ── Immutability ──────────────────────────────────────────────────────────

    [Theory]
    [InlineData(nameof(OnlinePaymentSession.BaseAmount))]
    [InlineData(nameof(OnlinePaymentSession.SurchargeAmount))]
    [InlineData(nameof(OnlinePaymentSession.SurchargePercentageBasisPoints))]
    [InlineData(nameof(OnlinePaymentSession.SurchargeFixedAmount))]
    [InlineData(nameof(OnlinePaymentSession.SurchargeCalculationVersion))]
    [InlineData(nameof(OnlinePaymentSession.ProviderMode))]
    [InlineData(nameof(OnlinePaymentSession.Amount))]
    public void Snapshot_properties_have_no_public_setter(string propertyName)
    {
        var property = typeof(OnlinePaymentSession).GetProperty(propertyName)!;

        Assert.NotNull(property);
        Assert.Null(property.GetSetMethod());
    }

    [Fact]
    public void No_public_method_can_rewrite_the_snapshot()
    {
        var mutators = typeof(OnlinePaymentSession)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => !m.IsSpecialName)
            .Select(m => m.Name)
            .ToArray();

        Assert.DoesNotContain(mutators, n => n.Contains("Surcharge", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(mutators, n => n.Contains("Amount", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Completing_a_session_does_not_change_its_snapshot()
    {
        var session = CreateSnapshot();

        session.MarkCompleted("pi_123", "evt_123", "complete", Guid.NewGuid(), DateTime.UtcNow);

        Assert.Equal(OnlinePaymentSessionStatus.Completed, session.Status);
        AssertCanonicalSnapshot(session);
    }

    [Fact]
    public void Cancelling_expiring_or_failing_a_session_does_not_change_its_snapshot()
    {
        var cancelled = CreateSnapshot();
        var expired   = CreateSnapshot();
        var failed    = CreateSnapshot();

        cancelled.MarkCancelled("evt_c", "expired");
        expired.MarkExpired("evt_e", "expired");
        failed.MarkFailed("pi_f", "evt_f", "failed");

        AssertCanonicalSnapshot(cancelled);
        AssertCanonicalSnapshot(expired);
        AssertCanonicalSnapshot(failed);
    }

    [Fact]
    public void Lifecycle_transitions_do_not_change_a_legacy_snapshot()
    {
        var session = CreateLegacy(88.20m);

        session.MarkCompleted("pi_legacy", "evt_legacy", "complete", Guid.NewGuid(), DateTime.UtcNow);

        Assert.Equal(88.20m, session.Amount);
        Assert.Equal(88.20m, session.BaseAmount);
        Assert.Equal(0m, session.SurchargeAmount);
        Assert.Equal(LegacyVersion, session.SurchargeCalculationVersion);
        Assert.Null(session.ProviderMode);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void AssertCanonicalSnapshot(OnlinePaymentSession session)
    {
        Assert.Equal(100.00m, session.BaseAmount);
        Assert.Equal(3.04m,   session.SurchargeAmount);
        Assert.Equal(103.04m, session.Amount);
        Assert.Equal(265,     session.SurchargePercentageBasisPoints);
        Assert.Equal(0.30m,   session.SurchargeFixedAmount);
        Assert.Equal(SurchargeVersion, session.SurchargeCalculationVersion);
        Assert.Equal(PaymentProviderMode.Test, session.ProviderMode);
    }

    private static OnlinePaymentSession CreateLegacy(decimal amount)
        => OnlinePaymentSession.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "ORD-1001",
            PaymentProvider.Stripe,
            "cs_test_" + Guid.NewGuid().ToString("N"),
            "https://checkout.stripe.com/c/pay/cs_test_123",
            amount,
            "NZD",
            PaymentPurpose.FullPayment);

    private static OnlinePaymentSession CreateSnapshot(
        decimal             baseAmount      = 100.00m,
        decimal             surchargeAmount = 3.04m,
        decimal             chargedAmount   = 103.04m,
        int                 basisPoints     = 265,
        decimal             fixedAmount     = 0.30m,
        string              version         = SurchargeVersion,
        PaymentProviderMode providerMode    = PaymentProviderMode.Test)
        => OnlinePaymentSession.CreateWithPaymentSnapshot(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "ORD-1001",
            PaymentProvider.Stripe,
            "cs_test_" + Guid.NewGuid().ToString("N"),
            "https://checkout.stripe.com/c/pay/cs_test_123",
            "NZD",
            PaymentPurpose.FullPayment,
            baseAmount,
            surchargeAmount,
            chargedAmount,
            basisPoints,
            fixedAmount,
            version,
            providerMode);
}
