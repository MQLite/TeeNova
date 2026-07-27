using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using TeeNova.EntityFrameworkCore.Payments;

namespace TeeNova.Payments;

/// <summary>
/// Asserts the persisted shape of the payment-session pricing snapshot (Phase 2B) directly from the real
/// entity type configuration: store types, lengths, nullability, and that the pre-existing Amount mapping and
/// indexes are untouched. Builds the model in memory only — no database connection, no migration execution.
/// </summary>
public sealed class OnlinePaymentSessionSnapshotMappingTests
{
    [Fact]
    public void Snapshot_columns_are_mapped_with_the_intended_types_and_lengths()
    {
        var entity = BuildEntityType();

        AssertColumn(entity, nameof(OnlinePaymentSession.BaseAmount),                     "decimal(18,4)", maxLength: null);
        AssertColumn(entity, nameof(OnlinePaymentSession.SurchargeAmount),                "decimal(18,4)", maxLength: null);
        AssertColumn(entity, nameof(OnlinePaymentSession.SurchargePercentageBasisPoints), "int",           maxLength: null);
        AssertColumn(entity, nameof(OnlinePaymentSession.SurchargeFixedAmount),           "decimal(18,2)", maxLength: null);
        AssertColumn(entity, nameof(OnlinePaymentSession.SurchargeCalculationVersion),    "nvarchar(64)",  maxLength: 64);
    }

    [Fact]
    public void Base_and_surcharge_amounts_match_the_existing_amount_precision()
    {
        var entity = BuildEntityType();

        var amount = entity.FindProperty(nameof(OnlinePaymentSession.Amount))!;

        Assert.Equal("decimal(18,4)", amount.GetColumnType());
        Assert.False(amount.IsNullable);
        Assert.Null(amount.FindAnnotation(RelationalAnnotationNames.DefaultValue));

        Assert.Equal(
            amount.GetColumnType(),
            entity.FindProperty(nameof(OnlinePaymentSession.BaseAmount))!.GetColumnType());
        Assert.Equal(
            amount.GetColumnType(),
            entity.FindProperty(nameof(OnlinePaymentSession.SurchargeAmount))!.GetColumnType());
    }

    [Fact]
    public void Base_amount_has_no_store_default_so_historical_rows_are_backfilled_not_zeroed()
    {
        var entity = BuildEntityType();

        // No store default at all: the migration backfills BaseAmount from Amount, so a historical row can
        // never fall back to 0.00.
        Assert.Null(entity
            .FindProperty(nameof(OnlinePaymentSession.BaseAmount))!
            .FindAnnotation(RelationalAnnotationNames.DefaultValue));

        Assert.NotNull(entity
            .FindProperty(nameof(OnlinePaymentSession.SurchargeAmount))!
            .FindAnnotation(RelationalAnnotationNames.DefaultValue));
    }

    [Fact]
    public void Snapshot_column_defaults_describe_a_legacy_no_surcharge_session()
    {
        var entity = BuildEntityType();

        Assert.Equal(0m, Default(entity, nameof(OnlinePaymentSession.SurchargeAmount)));
        Assert.Equal(0,  Default(entity, nameof(OnlinePaymentSession.SurchargePercentageBasisPoints)));
        Assert.Equal(0m, Default(entity, nameof(OnlinePaymentSession.SurchargeFixedAmount)));
        Assert.Equal(
            StripeSurchargeDefaults.LegacyCalculationVersion,
            Default(entity, nameof(OnlinePaymentSession.SurchargeCalculationVersion)));
    }

    [Fact]
    public void Provider_mode_is_a_nullable_string_column()
    {
        var entity = BuildEntityType();

        var property = entity.FindProperty(nameof(OnlinePaymentSession.ProviderMode))!;

        Assert.True(property.IsNullable);
        Assert.Equal("nvarchar(32)", property.GetColumnType());
        Assert.Equal(32, property.GetMaxLength());
    }

    [Fact]
    public void Charged_amount_alias_is_not_persisted()
    {
        var entity = BuildEntityType();

        Assert.Null(entity.FindProperty(nameof(OnlinePaymentSession.ChargedAmount)));
    }

    [Fact]
    public void Existing_indexes_remain_intact()
    {
        var entity = BuildEntityType();

        var indexNames = entity.GetIndexes().Select(i => i.GetDatabaseName()).OrderBy(n => n).ToArray();

        Assert.Equal(
            new[]
            {
                "IX_OnlinePaymentSessions_LastProviderEventId",
                "IX_OnlinePaymentSessions_OrderId",
                "IX_OnlinePaymentSessions_ProviderPaymentId",
                "IX_OnlinePaymentSessions_ProviderSessionId",
                "IX_OnlinePaymentSessions_Status",
            },
            indexNames);

        var providerSessionIdIndex = Assert.Single(
            entity.GetIndexes(),
            i => i.GetDatabaseName() == "IX_OnlinePaymentSessions_ProviderSessionId");

        Assert.True(providerSessionIdIndex.IsUnique);
    }

    private static IEntityType BuildEntityType()
    {
        // Building the model off a SQL Server context resolves the real store types without ever opening a
        // connection — the connection string below is never connected to.
        using var context = new MappingProbeDbContext();
        return context.Model.FindEntityType(typeof(OnlinePaymentSession))!;
    }

    private sealed class MappingProbeDbContext : DbContext
    {
        protected override void OnConfiguring(DbContextOptionsBuilder options)
            => options.UseSqlServer("Server=(local);Database=TeeNovaSessionMappingProbe;Trusted_Connection=True");

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            new OnlinePaymentSessionEntityTypeConfiguration()
                .Configure(modelBuilder.Entity<OnlinePaymentSession>());
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
