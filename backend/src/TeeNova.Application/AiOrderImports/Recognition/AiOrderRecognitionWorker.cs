using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.Operations;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Threading;

namespace TeeNova.AiOrderImports.Recognition;

public sealed class AiOrderRecognitionWorker : AsyncPeriodicBackgroundWorkerBase
{
    private readonly AiOrderFeatureOptions _features;

    public AiOrderRecognitionWorker(
        AbpAsyncTimer timer,
        IServiceScopeFactory serviceScopeFactory,
        IOptions<AiOrderRecognitionOptions> options,
        IOptions<AiOrderFeatureOptions> features)
        : base(timer, serviceScopeFactory)
    {
        _features = features.Value;
        Timer.Period = checked(options.Value.WorkerPeriodSeconds * 1000);
    }

    protected override async Task DoWorkAsync(
        PeriodicBackgroundWorkerContext workerContext)
    {
        if (!_features.Enabled || !_features.RecognitionEnabled)
            return;
        var processor = workerContext.ServiceProvider
            .GetRequiredService<AiOrderRecognitionProcessor>();
        var stoppingToken = StoppingToken;
        var dueRetryIds = await processor.GetDueRetryImportIdsAsync(
            2,
            stoppingToken);
        foreach (var importId in dueRetryIds)
            await processor.TryQueueAutomaticRetryAsync(
                importId,
                stoppingToken);

        var candidateIds = await processor.GetProcessingCandidateIdsAsync(
            2,
            stoppingToken);

        foreach (var attemptId in candidateIds)
        {
            var claim = await processor.TryClaimAsync(attemptId, stoppingToken);
            if (claim is not null)
                await processor.ProcessClaimedAsync(
                    attemptId,
                    claim,
                    stoppingToken);
        }
    }
}
