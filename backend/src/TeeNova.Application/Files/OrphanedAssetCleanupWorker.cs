using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TeeNova.Customization;
using TeeNova.Files;
using TeeNova.Orders;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Threading;
using Volo.Abp.Uow;

namespace TeeNova.Files;

/// <summary>
/// Runs once every 24 hours.
/// Finds UploadedAssets that are older than <see cref="OrphanThresholdHours"/> hours
/// and have no corresponding OrderItem reference, then deletes both the DB record
/// and the physical file from storage.
/// </summary>
public class OrphanedAssetCleanupWorker : AsyncPeriodicBackgroundWorkerBase
{
    /// <summary>Assets not linked to an order within this window are considered orphans.</summary>
    private const int OrphanThresholdHours = 24;

    public OrphanedAssetCleanupWorker(
        AbpAsyncTimer timer,
        IServiceScopeFactory serviceScopeFactory)
        : base(timer, serviceScopeFactory)
    {
        Timer.Period = (int)TimeSpan.FromHours(24).TotalMilliseconds;
    }

    [UnitOfWork]
    protected override async Task DoWorkAsync(PeriodicBackgroundWorkerContext workerContext)
    {
        // Resolve scoped services from the worker's per-execution scope,
        // NOT from constructor injection (would be captive dependency in singleton).
        var assetRepository = workerContext.ServiceProvider
            .GetRequiredService<IRepository<UploadedAsset, Guid>>();
        var orderItemPositionAssetRepository = workerContext.ServiceProvider
            .GetRequiredService<IRepository<OrderItemPositionAsset, Guid>>();
        var storageService = workerContext.ServiceProvider
            .GetRequiredService<IFileStorageService>();

        Logger.LogInformation("[AssetCleanup] Starting orphaned asset cleanup...");

        var cutoff = DateTime.UtcNow.AddHours(-OrphanThresholdHours);

        // Only process customer design uploads.
        // ProductImage assets are managed by admin and must never be auto-deleted.
        var candidates = await assetRepository.GetListAsync(
            a => a.AssetType == AssetType.CustomerDesign && a.CreationTime < cutoff);

        if (candidates.Count == 0)
        {
            Logger.LogInformation("[AssetCleanup] No candidate assets found.");
            return;
        }

        var candidateIds = candidates.Select(a => a.Id).ToList();
        var referencedIds = (await orderItemPositionAssetRepository.GetListAsync(
                    p => p.UploadedAssetId != null && candidateIds.Contains(p.UploadedAssetId!.Value)))
                .Select(p => p.UploadedAssetId!.Value).ToHashSet();

        var orphans = candidates.Where(a => !referencedIds.Contains(a.Id)).ToList();

        Logger.LogInformation(
            "[AssetCleanup] {Total} candidates, {Referenced} referenced, {Orphans} orphans to delete.",
            candidates.Count, referencedIds.Count, orphans.Count);

        var deleted = 0;
        var failed = new List<Guid>();

        foreach (var asset in orphans)
        {
            try
            {
                await storageService.DeleteAsync(asset.StoredFileUrl);
                await assetRepository.DeleteAsync(asset, autoSave: true);
                deleted++;
            }
            catch (Exception ex)
            {
                Logger.LogWarning(ex,
                    "[AssetCleanup] Failed to delete asset {AssetId} ({FileName}).",
                    asset.Id, asset.OriginalFileName);
                failed.Add(asset.Id);
            }
        }

        Logger.LogInformation(
            "[AssetCleanup] Done. Deleted: {Deleted}, Failed: {Failed}.",
            deleted, failed.Count);
    }
}
