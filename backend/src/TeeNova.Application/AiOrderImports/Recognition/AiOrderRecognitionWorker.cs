using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Threading;

namespace TeeNova.AiOrderImports.Recognition;

public sealed class AiOrderRecognitionWorker : AsyncPeriodicBackgroundWorkerBase
{
    public AiOrderRecognitionWorker(
        AbpAsyncTimer timer,
        IServiceScopeFactory serviceScopeFactory,
        IOptions<AiOrderRecognitionOptions> options)
        : base(timer, serviceScopeFactory)
    {
        Timer.Period = checked(options.Value.WorkerPeriodSeconds * 1000);
    }

    protected override async Task DoWorkAsync(
        PeriodicBackgroundWorkerContext workerContext)
    {
        var processor = workerContext.ServiceProvider
            .GetRequiredService<AiOrderRecognitionProcessor>();
        var stoppingToken = StoppingToken;
        await processor.CleanupExpiredRawEvidenceAsync(
            stoppingToken);
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
