using System.Reflection;
using Microsoft.Extensions.Configuration;
using TeeNova.Payments.Dtos;
using Volo.Abp;

namespace TeeNova.Payments;

public sealed class StripeSurchargeSettingsTests
{
    [Fact]
    public void New_rows_have_disabled_safe_defaults()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        Assert.False(setting.SurchargeEnabled);
        Assert.Equal(265, setting.SurchargePercentageBasisPoints);
        Assert.Equal(0.30m, setting.SurchargeFixedAmount);
        Assert.Equal(StripeSurchargeDefaults.DisclosureText, setting.SurchargeDisclosureText);
        Assert.Equal(StripeSurchargeCalculator.CurrentCalculationVersion, setting.SurchargeCalculationVersion);
        Assert.Null(setting.GetSurchargeValidationCode());
    }

    [Fact]
    public void Complete_configuration_updates_all_fields_atomically()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        setting.ConfigureSurcharge(true, 265, 0.30m, "  Card surcharge shown before Stripe.  ", Version);

        Assert.True(setting.SurchargeEnabled);
        Assert.Equal(265, setting.SurchargePercentageBasisPoints);
        Assert.Equal(0.30m, setting.SurchargeFixedAmount);
        Assert.Equal("Card surcharge shown before Stripe.", setting.SurchargeDisclosureText);
        Assert.Equal(Version, setting.SurchargeCalculationVersion);
    }

    [Fact]
    public void Zero_rate_and_zero_fixed_amount_are_valid()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        setting.ConfigureSurcharge(true, 0, 0m, "Card surcharge shown before Stripe.", Version);

        Assert.Null(setting.GetSurchargeValidationCode());
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(10_000)]
    [InlineData(10_001)]
    public void Invalid_rates_are_rejected(int rate)
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        var exception = Assert.Throws<ArgumentOutOfRangeException>(
            () => setting.ConfigureSurcharge(true, rate, 0.30m, "Disclosure", Version));

        Assert.Equal("percentageBasisPoints", exception.ParamName);
    }

    [Fact]
    public void Negative_fixed_amount_is_rejected()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        var exception = Assert.Throws<ArgumentOutOfRangeException>(
            () => setting.ConfigureSurcharge(true, 265, -0.01m, "Disclosure", Version));

        Assert.Equal("fixedAmount", exception.ParamName);
    }

    [Fact]
    public void Non_cent_aligned_fixed_amounts_are_rejected()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        foreach (var amount in new[] { 0.001m, 0.305m, 1.2345m })
        {
            var exception = Assert.Throws<ArgumentOutOfRangeException>(
                () => setting.ConfigureSurcharge(true, 265, amount, "Disclosure", Version));
            Assert.Equal("fixedAmount", exception.ParamName);
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_disclosure_is_rejected(string disclosure)
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        var exception = Assert.Throws<ArgumentException>(
            () => setting.ConfigureSurcharge(true, 265, 0.30m, disclosure, Version));

        Assert.Equal("disclosureText", exception.ParamName);
    }

    [Fact]
    public void Excessively_long_disclosure_is_rejected()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        var exception = Assert.Throws<ArgumentException>(
            () => setting.ConfigureSurcharge(
                true,
                265,
                0.30m,
                new string('x', PaymentProviderSetting.MaxSurchargeDisclosureLength + 1),
                Version));

        Assert.Equal("disclosureText", exception.ParamName);
    }

    [Fact]
    public void Unsupported_calculation_version_is_rejected()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);

        var exception = Assert.Throws<ArgumentException>(
            () => setting.ConfigureSurcharge(true, 265, 0.30m, "Disclosure", "stripe-gross-up-v2"));

        Assert.Equal("calculationVersion", exception.ParamName);
    }

    [Fact]
    public void Invalid_update_leaves_all_previous_values_unchanged()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);
        setting.ConfigureSurcharge(true, 321, 1.25m, "Original disclosure", Version);

        Assert.Throws<ArgumentException>(
            () => setting.ConfigureSurcharge(false, 100, 0m, " ", Version));

        Assert.True(setting.SurchargeEnabled);
        Assert.Equal(321, setting.SurchargePercentageBasisPoints);
        Assert.Equal(1.25m, setting.SurchargeFixedAmount);
        Assert.Equal("Original disclosure", setting.SurchargeDisclosureText);
        Assert.Equal(Version, setting.SurchargeCalculationVersion);
    }

    [Fact]
    public void Omitted_fields_preserve_existing_values()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);
        setting.ConfigureSurcharge(true, 321, 1.25m, "Existing disclosure", Version);

        var changed = StripeSurchargeSettingsUpdatePolicy.Apply(setting, default);

        Assert.False(changed);
        Assert.True(setting.SurchargeEnabled);
        Assert.Equal(321, setting.SurchargePercentageBasisPoints);
        Assert.Equal(1.25m, setting.SurchargeFixedAmount);
        Assert.Equal("Existing disclosure", setting.SurchargeDisclosureText);
    }

    [Fact]
    public void Omitted_fields_leave_new_row_at_disabled_safe_defaults()
    {
        var setting = CreateSetting(PaymentProviderMode.Live);

        var changed = StripeSurchargeSettingsUpdatePolicy.Apply(setting, default);

        Assert.False(changed);
        Assert.False(setting.SurchargeEnabled);
        Assert.Equal(StripeSurchargeDefaults.PercentageBasisPoints, setting.SurchargePercentageBasisPoints);
        Assert.Equal(StripeSurchargeDefaults.FixedAmount, setting.SurchargeFixedAmount);
    }

    [Fact]
    public void Partial_configuration_is_rejected_without_mutating_existing_values()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);
        setting.ConfigureSurcharge(true, 321, 1.25m, "Existing disclosure", Version);
        var partial = new StripeSurchargeSettingsUpdate(
            Enabled: false,
            PercentageBasisPoints: null,
            FixedAmount: null,
            DisclosureText: null,
            CalculationVersion: null);

        var exception = Assert.Throws<BusinessException>(
            () => StripeSurchargeSettingsUpdatePolicy.Apply(setting, partial));

        Assert.Equal("TeeNova:Payment:SurchargeConfigurationIncomplete", exception.Code);
        Assert.True(setting.SurchargeEnabled);
        Assert.Equal(321, setting.SurchargePercentageBasisPoints);
        Assert.Equal(1.25m, setting.SurchargeFixedAmount);
    }

    [Fact]
    public void Test_and_live_rows_are_independent_and_snapshots_use_their_own_row()
    {
        var test = CreateReadySetting(PaymentProviderMode.Test);
        var live = CreateReadySetting(PaymentProviderMode.Live);
        test.ConfigureSurcharge(true, 265, 0.30m, "Test disclosure", Version);
        live.ConfigureSurcharge(false, 400, 0.50m, "Live disclosure", Version);

        StripeSurchargeSettingsUpdatePolicy.Apply(
            test,
            new StripeSurchargeSettingsUpdate(true, 300, 0.45m, "Updated Test disclosure", Version));

        var testSnapshot = StripePaymentSettingsResolver.CreateSnapshot(test, "sk_test_test", "whsec_test");
        var liveSnapshot = StripePaymentSettingsResolver.CreateSnapshot(live, "sk_live_live", "whsec_live");

        Assert.Equal(PaymentProviderMode.Test, testSnapshot.Mode);
        Assert.True(testSnapshot.IsEnabled);
        Assert.Equal("sk_test_test", testSnapshot.SecretKey);
        Assert.Equal(300, testSnapshot.SurchargePercentageBasisPoints);
        Assert.Equal("Updated Test disclosure", testSnapshot.SurchargeDisclosureText);
        Assert.True(testSnapshot.SurchargeConfigurationValid);

        Assert.Equal(PaymentProviderMode.Live, liveSnapshot.Mode);
        Assert.True(liveSnapshot.IsEnabled);
        Assert.Equal("sk_live_live", liveSnapshot.SecretKey);
        Assert.Equal(400, liveSnapshot.SurchargePercentageBasisPoints);
        Assert.Equal("Live disclosure", liveSnapshot.SurchargeDisclosureText);
        Assert.True(liveSnapshot.SurchargeConfigurationValid);
    }

    [Fact]
    public void Active_row_predicate_never_falls_back_between_test_and_live()
    {
        var test = CreateSetting(PaymentProviderMode.Test);
        var live = CreateSetting(PaymentProviderMode.Live);
        var rows = new[] { test, live };

        var selectedTest = rows.Single(StripePaymentSettingsResolver
            .BuildActiveRowPredicate(PaymentProviderMode.Test).Compile());
        var selectedLive = rows.Single(StripePaymentSettingsResolver
            .BuildActiveRowPredicate(PaymentProviderMode.Live).Compile());

        Assert.Same(test, selectedTest);
        Assert.Same(live, selectedLive);
        Assert.Null(new[] { live }.SingleOrDefault(StripePaymentSettingsResolver
            .BuildActiveRowPredicate(PaymentProviderMode.Test).Compile()));
        Assert.Null(new[] { test }.SingleOrDefault(StripePaymentSettingsResolver
            .BuildActiveRowPredicate(PaymentProviderMode.Live).Compile()));
    }

    [Fact]
    public async Task Live_update_remains_blocked_when_server_unlock_is_off()
    {
        var service = CreateSettingsService(liveUnlocked: false);
        var input = new UpdateStripeLiveSettingsDto { ConfirmationPhrase = "ENABLE LIVE MODE" };

        await Assert.ThrowsAsync<UserFriendlyException>(() => service.UpdateStripeLiveAsync(input));
    }

    [Fact]
    public async Task Live_update_still_requires_the_exact_confirmation_phrase()
    {
        var service = CreateSettingsService(liveUnlocked: true);
        var input = new UpdateStripeLiveSettingsDto { ConfirmationPhrase = "enable live mode" };

        await Assert.ThrowsAsync<UserFriendlyException>(() => service.UpdateStripeLiveAsync(input));
    }

    [Fact]
    public void Disabled_surcharge_does_not_block_otherwise_ready_setting()
    {
        var setting = CreateReadySetting(PaymentProviderMode.Test);

        var result = StripePaymentReadinessEvaluator.Evaluate(setting, true, true);

        Assert.True(result.CanCreate);
        Assert.Equal("ReadyForManualSmoke", result.Code);
        Assert.Null(result.SurchargeValidationCode);
        Assert.Empty(result.Missing);
    }

    [Fact]
    public void Enabled_valid_surcharge_preserves_readiness()
    {
        var setting = CreateReadySetting(PaymentProviderMode.Test);
        setting.ConfigureSurcharge(true, 265, 0.30m, "Disclosure", Version);

        var result = StripePaymentReadinessEvaluator.Evaluate(setting, true, true);

        Assert.True(result.CanCreate);
        Assert.Equal("ReadyForManualSmoke", result.Code);
        Assert.Null(result.SurchargeValidationCode);
    }

    [Theory]
    [MemberData(nameof(InvalidPersistedSettings))]
    public void Invalid_enabled_persisted_data_blocks_readiness(
        string propertyName,
        object? invalidValue,
        string expectedCode)
    {
        var setting = CreateReadySetting(PaymentProviderMode.Test);
        setting.ConfigureSurcharge(true, 265, 0.30m, "Disclosure", Version);
        SetPersistedValue(setting, propertyName, invalidValue);

        var result = StripePaymentReadinessEvaluator.Evaluate(setting, true, true);

        Assert.False(result.CanCreate);
        Assert.Equal(expectedCode, result.Code);
        Assert.Equal(expectedCode, result.SurchargeValidationCode);
        Assert.Contains(expectedCode, result.Missing);
    }

    [Fact]
    public void Invalid_enabled_persisted_data_fails_closed_at_runtime_resolution_boundary()
    {
        var setting = CreateReadySetting(PaymentProviderMode.Test);
        setting.ConfigureSurcharge(true, 265, 0.30m, "Disclosure", Version);
        SetPersistedValue(setting, "SurchargeCalculationVersion", "unsupported");

        var exception = Assert.Throws<BusinessException>(
            () => StripePaymentSettingsResolver.EnsureSurchargeConfigurationValid(setting));

        Assert.Equal("TeeNova:Payment:StripeSurchargeConfigurationInvalid", exception.Code);
        Assert.Equal(
            "SurchargeCalculationVersionUnsupported",
            exception.Data["ReasonCode"]);
    }

    [Fact]
    public void Enabled_surcharge_with_non_nzd_currency_blocks_readiness()
    {
        var setting = CreateReadySetting(PaymentProviderMode.Test);
        setting.ConfigureStripe("AUD", null, "https://example.test/success", "https://example.test/cancel");
        setting.ConfigureSurcharge(true, 265, 0.30m, "Disclosure", Version);

        var result = StripePaymentReadinessEvaluator.Evaluate(setting, true, true);

        Assert.False(result.CanCreate);
        Assert.Equal("SurchargeCurrencyInvalid", result.Code);
    }

    [Fact]
    public void Existing_missing_key_failure_is_not_masked_by_invalid_surcharge()
    {
        var setting = CreateSetting(PaymentProviderMode.Test);
        setting.SetWebhookSecret("webhook-cipher", "hook");
        setting.ConfigureSurcharge(true, 265, 0.30m, "Disclosure", Version);
        SetPersistedValue(setting, "SurchargePercentageBasisPoints", -1);

        var result = StripePaymentReadinessEvaluator.Evaluate(setting, returnUrlsValid: false, encryptionReady: true);

        Assert.False(result.CanCreate);
        Assert.Equal("MissingSecretKey", result.Code);
        Assert.Contains("InvalidReturnUrl", result.Missing);
        Assert.Contains("SurchargeRateInvalid", result.Missing);
    }

    [Fact]
    public void Safe_settings_dtos_expose_no_secret_or_ciphertext_values()
    {
        AssertNoSecretProperties(typeof(PaymentProviderSettingDto));
        AssertNoSecretProperties(typeof(StripeTestSettingsValidationResultDto));
    }

    private static void AssertNoSecretProperties(Type dtoType)
    {
        var unsafeNames = dtoType
            .GetProperties()
            .Select(property => property.Name)
            .Where(name =>
                name.Contains("CipherText", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("SecretKey", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("WebhookSecret", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Passphrase", StringComparison.OrdinalIgnoreCase) &&
                !name.EndsWith("Configured", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Assert.Empty(unsafeNames);
    }

    private static PaymentProviderSetting CreateSetting(PaymentProviderMode mode) =>
        new(Guid.NewGuid(), PaymentProvider.Stripe, mode);

    private static PaymentProviderSetting CreateReadySetting(PaymentProviderMode mode)
    {
        var setting = CreateSetting(mode);
        setting.ConfigureStripe("NZD", $"pk_{mode}", "https://example.test/success", "https://example.test/cancel");
        setting.SetSecretKey("secret-cipher", "cret");
        setting.SetWebhookSecret("webhook-cipher", "hook");
        setting.Enable();
        return setting;
    }

    private static PaymentProviderSettingsAppService CreateSettingsService(bool liveUnlocked)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["OnlinePayments:AllowLiveModeConfiguration"] = liveUnlocked.ToString()
            })
            .Build();

        return new PaymentProviderSettingsAppService(
            repository: null!,
            encryption: null!,
            configuration,
            logger: null!);
    }

    private static void SetPersistedValue(PaymentProviderSetting setting, string propertyName, object? value)
    {
        var property = typeof(PaymentProviderSetting).GetProperty(
            propertyName,
            BindingFlags.Instance | BindingFlags.Public);

        Assert.NotNull(property);
        property!.SetValue(setting, value);
    }

    public static TheoryData<string, object?, string> InvalidPersistedSettings => new()
    {
        { "SurchargePercentageBasisPoints", -1, "SurchargeRateInvalid" },
        { "SurchargePercentageBasisPoints", 10_000, "SurchargeRateInvalid" },
        { "SurchargeFixedAmount", -0.01m, "SurchargeFixedAmountInvalid" },
        { "SurchargeFixedAmount", 0.001m, "SurchargeFixedAmountInvalid" },
        { "SurchargeDisclosureText", null, "SurchargeDisclosureMissing" },
        { "SurchargeCalculationVersion", "unsupported", "SurchargeCalculationVersionUnsupported" }
    };

    private const string Version = StripeSurchargeCalculator.CurrentCalculationVersion;
}
