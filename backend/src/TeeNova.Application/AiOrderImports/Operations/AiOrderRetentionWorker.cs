using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Threading;

namespace TeeNova.AiOrderImports.Operations;

public sealed class AiOrderRetentionWorker : AsyncPeriodicBackgroundWorkerBase
{
    private static readonly SemaphoreSlim ProcessGate = new(1, 1);
    private readonly AiOrderRetentionOptions _options;

    public AiOrderRetentionWorker(
        AbpAsyncTimer timer,
        IServiceScopeFactory serviceScopeFactory,
        IOptions<AiOrderRetentionOptions> options)
        : base(timer, serviceScopeFactory)
    {
        _options = options.Value;
        Timer.Period = checked(_options.WorkerPeriodMinutes * 60 * 1000);
    }

    protected override async Task DoWorkAsync(PeriodicBackgroundWorkerContext workerContext)
    {
        if (!_options.WorkerEnabled ||
            !await ProcessGate.WaitAsync(0, StoppingToken))
            return;
        try
        {
            await workerContext.ServiceProvider
                .GetRequiredService<AiOrderRetentionAppService>()
                .RunBatchAsync(StoppingToken);
        }
        finally
        {
            ProcessGate.Release();
        }
    }
}
