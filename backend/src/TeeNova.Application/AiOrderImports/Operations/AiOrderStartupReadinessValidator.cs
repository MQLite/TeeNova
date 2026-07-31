using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.AiOrderImports.Recognition;

namespace TeeNova.AiOrderImports.Operations;

public sealed class AiOrderStartupReadinessValidator : IHostedService
{
    private readonly AiOrderFeatureOptions _features;
    private readonly AiOrderRetentionOptions _retention;
    private readonly AiOrderRecognitionOptions _recognition;
    private readonly AiOrderProviderReadiness _providerReadiness;
    private readonly IHostEnvironment _environment;
    private readonly IServiceProvider _services;

    public AiOrderStartupReadinessValidator(
        IOptions<AiOrderFeatureOptions> features,
        IOptions<AiOrderRetentionOptions> retention,
        IOptions<AiOrderRecognitionOptions> recognition,
        AiOrderProviderReadiness providerReadiness,
        IHostEnvironment environment,
        IServiceProvider services)
    {
        _features = features.Value;
        _retention = retention.Value;
        _recognition = recognition.Value;
        _providerReadiness = providerReadiness;
        _environment = environment;
        _services = services;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_features.Enabled && !_retention.WorkerEnabled)
            return;

        if (_features.IntakeEnabled || _features.RecognitionEnabled || _retention.WorkerEnabled)
        {
            var storage = await _services.GetRequiredService<IPrivateObjectStorage>()
                .CheckReadinessAsync(cancellationToken);
            if (storage.Status != PrivateStorageReadinessStatus.Ready)
                throw new InvalidOperationException(
                    $"AI Order private storage readiness failed: {storage.Status}.");
        }

        if (_features.RecognitionEnabled)
        {
            var providers = _providerReadiness.Evaluate(
                _recognition,
                _features,
                _environment.EnvironmentName);
            if (providers.All(x => x.Status != "Ready"))
                throw new InvalidOperationException(
                    "AI Order recognition is enabled but no provider is operationally ready.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
