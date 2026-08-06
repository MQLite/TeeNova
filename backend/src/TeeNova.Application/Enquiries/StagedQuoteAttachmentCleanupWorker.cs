using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using TeeNova.Enquiries.PrivateStorage;
using TeeNova.Notifications;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Threading;
using Volo.Abp.Uow;

namespace TeeNova.Enquiries;

public class StagedQuoteAttachmentCleanupWorker : AsyncPeriodicBackgroundWorkerBase
{
    public StagedQuoteAttachmentCleanupWorker(AbpAsyncTimer timer, IServiceScopeFactory serviceScopeFactory)
        : base(timer, serviceScopeFactory) => Timer.Period = (int)TimeSpan.FromMinutes(15).TotalMilliseconds;

    [UnitOfWork]
    protected override async Task DoWorkAsync(PeriodicBackgroundWorkerContext workerContext)
    {
        var options = workerContext.ServiceProvider.GetRequiredService<IOptions<QuoteRequestOptions>>().Value;
        if (!options.Enabled) return;
        var repository = workerContext.ServiceProvider.GetRequiredService<IRepository<QuoteRequestAttachment, Guid>>();
        var storage = workerContext.ServiceProvider.GetRequiredService<IQuotePrivateObjectStorage>();
        var expired = await repository.GetListAsync(x => x.QuoteRequestId == null && x.StagedUntil != null && x.StagedUntil <= DateTime.UtcNow);
        foreach (var attachment in expired)
        {
            try
            {
                await storage.DeleteAsync(attachment.ObjectKey);
                await repository.DeleteAsync(attachment, autoSave: true);
            }
            catch (Exception ex)
            {
                Logger.LogWarning(ex, "[QuoteRequest] Failed to clean staged attachment {AttachmentId}.", attachment.Id);
            }
        }

        if (options.RetentionDays is not > 0) return;
        var quoteRepository = workerContext.ServiceProvider.GetRequiredService<IRepository<QuoteRequest, Guid>>();
        var notificationLogs = workerContext.ServiceProvider.GetRequiredService<IRepository<EmailNotificationLog, Guid>>();
        var unitOfWorkManager = workerContext.ServiceProvider.GetRequiredService<IUnitOfWorkManager>();
        var cutoff = DateTime.UtcNow.AddDays(-options.RetentionDays.Value);
        var quoteQuery = await quoteRepository.WithDetailsAsync(x => x.Attachments);
        var retained = await quoteQuery.Where(x => x.CreationTime <= cutoff).OrderBy(x => x.CreationTime).Take(100).ToListAsync();
        foreach (var quote in retained)
        {
            try
            {
                using var retentionUnitOfWork = unitOfWorkManager.Begin(requiresNew: true, isTransactional: true);
                foreach (var attachment in quote.Attachments)
                    await storage.DeleteAsync(attachment.ObjectKey);
                foreach (var attachment in quote.Attachments.ToList())
                    await repository.DeleteAsync(attachment);
                var logs = await notificationLogs.GetListAsync(x => x.OrderId == quote.Id &&
                    (x.EventType == EmailEventTypes.AdminNewQuoteRequest ||
                     x.EventType == EmailEventTypes.CustomerQuoteRequestAcknowledgement));
                foreach (var log in logs) await notificationLogs.DeleteAsync(log);
                quote.AnonymizeForRetention();
                await quoteRepository.UpdateAsync(quote, autoSave: true);
                await quoteRepository.DeleteAsync(quote, autoSave: true);
                await retentionUnitOfWork.CompleteAsync();
                Logger.LogInformation("[QuoteRequest] Applied approved retention to quote {QuoteId}.", quote.Id);
            }
            catch (Exception ex)
            {
                Logger.LogWarning(ex, "[QuoteRequest] Failed to apply retention to quote {QuoteId}.", quote.Id);
            }
        }
    }
}
