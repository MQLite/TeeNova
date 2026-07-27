using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using TeeNova.EntityFrameworkCore.Payments;

namespace TeeNova.Payments;

/// <summary>
/// Asserts the persisted surcharge column shape (type, length, nullability, disabled-safe defaults) directly
/// from the real entity type configuration. Builds the model in memory only — no database connection, no
/// migration execution, and nothing that depends on a developer's local SQL Server.
/// </summary>
public sealed class StripeSurchargeMappingTests
{
    [Fact]
    public void Surcharge_columns_are_mapped_with_the_intended_types_and_lengths()
    {
        var entity = BuildPaymentProviderSettingEntityType();

        AssertColumn(entity, nameof(PaymentProviderSetting.SurchargeEnabled),               "bit",            maxLength: null);
        AssertColumn(entity, nameof(PaymentProviderSetting.SurchargePercentageBasisPoints), "int",            maxLength: null);
        AssertColumn(entity, nameof(PaymentProviderSetting.SurchargeFixedAmount),           "decimal(18,2)",  maxLength: null);
        AssertColumn(entity, nameof(PaymentProviderSetting.SurchargeDisclosureText),        "nvarchar(500)",  maxLength: 500);
        AssertColumn(entity, nameof(PaymentProviderSetting.SurchargeCalculationVersion),    "nvarchar(64)",   maxLength: 64);
    }

    [Fact]
    public void Surcharge_column_defaults_are_disabled_safe()
    {
        var entity = BuildPaymentProviderSettingEntityType();

        Assert.Equal(false, Default(entity, nameof(PaymentProviderSetting.SurchargeEnabled)));
        Assert.Equal(265, Default(entity, nameof(PaymentProviderSetting.SurchargePercentageBasisPoints)));
        Assert.Equal(0.30m, Default(entity, nameof(PaymentProviderSetting.SurchargeFixedAmount)));
        Assert.Equal(
            StripeSurchargeDefaults.DisclosureText,
            Default(entity, nameof(PaymentProviderSetting.SurchargeDisclosureText)));
        Assert.Equal(
            StripeSurchargeCalculator.CurrentCalculationVersion,
            Default(entity, nameof(PaymentProviderSetting.SurchargeCalculationVersion)));
    }

    [Fact]
    public void Surcharge_mapping_leaves_the_provider_mode_uniqueness_constraint_intact()
    {
        var entity = BuildPaymentProviderSettingEntityType();

        var index = Assert.Single(
            entity.GetIndexes(),
            i => i.Properties.Select(p => p.Name).SequenceEqual(
                new[] { nameof(PaymentProviderSetting.Provider), nameof(PaymentProviderSetting.Mode) }));

        Assert.True(index.IsUnique);
    }

    private static IEntityType BuildPaymentProviderSettingEntityType()
    {
        // Building the model off a SQL Server context resolves the real store types without ever opening a
        // connection — the connection string below is never connected to.
        using var context = new MappingProbeDbContext();
        return context.Model.FindEntityType(typeof(PaymentProviderSetting))!;
    }

    private sealed class MappingProbeDbContext : DbContext
    {
        protected override void OnConfiguring(DbContextOptionsBuilder options)
            => options.UseSqlServer("Server=(local);Database=TeeNovaSurchargeMappingProbe;Trusted_Connection=True");

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            var builder = modelBuilder.Entity<PaymentProviderSetting>();

            // ABP infrastructure state is normally mapped by ConfigureByConvention(); it is irrelevant to the
            // surcharge column shape under test, so it is ignored to keep this probe provider-only.
            builder.Ignore(e => e.ExtraProperties);

            new PaymentProviderSettingEntityTypeConfiguration().Configure(builder);
        }
    }

    private static void AssertColumn(IEntityType entity, string propertyName, string columnType, int? maxLength)
    {
        var property = entity.FindProperty(propertyName);

        Assert.NotNull(property);
        Assert.False(property!.IsNullable);
        Assert.Equal(columnType, property.GetColumnType());
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    private static object? Default(IEntityType entity, string propertyName)
        => entity.FindProperty(propertyName)!.GetDefaultValue();
}
