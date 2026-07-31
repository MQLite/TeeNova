using System.Diagnostics.Metrics;

namespace TeeNova.AiOrderImports.Operations;

public sealed class AiOrderOperationalTelemetry : IDisposable
{
    private readonly Meter _meter = new("TeeNova.AiOrderImport", "1.0.0");
    private readonly Counter<long> _retentionOutcomes;
    private readonly Counter<long> _featureBlocks;
    private readonly Counter<long> _providerQuotaBlocks;

    public AiOrderOperationalTelemetry()
    {
        _retentionOutcomes = _meter.CreateCounter<long>("ai_order_retention_operations");
        _featureBlocks = _meter.CreateCounter<long>("ai_order_feature_blocks");
        _providerQuotaBlocks = _meter.CreateCounter<long>("ai_order_provider_quota_blocks");
    }

    public void RecordRetention(string target, string outcome) =>
        _retentionOutcomes.Add(
            1,
            new KeyValuePair<string, object?>("target", target),
            new KeyValuePair<string, object?>("outcome", outcome));

    public void RecordFeatureBlock(string stage) =>
        _featureBlocks.Add(1, new KeyValuePair<string, object?>("stage", stage));

    public void RecordProviderQuotaBlock(string provider, string period) =>
        _providerQuotaBlocks.Add(
            1,
            new KeyValuePair<string, object?>("provider", provider),
            new KeyValuePair<string, object?>("period", period));

    public void Dispose() => _meter.Dispose();
}
