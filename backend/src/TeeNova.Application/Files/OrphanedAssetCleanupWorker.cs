using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TeeNova.Customization;
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

    private readonly IRepository<UploadedAsset, Guid> _assetRepository;
    private readonly IRepository<OrderItem, Guid> _orderItemRepository;
    private readonly IFileStorageService _storageService;

    public OrphanedAssetCleanupWorker(
        AbpAsyncTimer timer,
        IServiceScopeFactory serviceScopeFactory,
        IRepository<UploadedAsset, Guid> assetRepository,
        IRepository<OrderItem, Guid> orderItemRepository,
        IFileStorageService storageService)
        : base(timer, serviceScopeFactory)
    {
        Timer.Period = (int)TimeSpan.FromHours(24).TotalMilliseconds;
        _assetRepository = assetRepository;
        _orderItemRepository = orderItemRepository;
        _storageService = storageService;
    }

    [UnitOfWork]
    protected override async Task DoWorkAsync(PeriodicBackgroundWorkerContext workerContext)
    {
        Logger.LogInformation("[AssetCleanup] Starting orphaned asset cleanup...");

        var cutoff = DateTime.UtcNow.AddHours(-OrphanThresholdHours);

        // All assets older than the threshold
        var candidates = await _assetRepository.GetListAsync(
            a => a.CreationTime < cutoff);

        if (candidates.Count == 0)
        {
            Logger.LogInformation("[AssetCleanup] No candidate assets found.");
            return;
        }

        // IDs of assets that ARE referenced by at least one order item
        var candidateIds = candidates.Select(a => a.Id).ToList();
        var referencedIds = (await _orderItemRepository.GetListAsync(
                oi => oi.UploadedAssetId != null && candidateIds.Contains(oi.UploadedAssetId!.Value)))
            .Select(oi => oi.UploadedAssetId!.Value)
            .ToHashSet();

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
                await _storageService.DeleteAsync(asset.StoredFileUrl);
                await _assetRepository.DeleteAsync(asset, autoSave: true);
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
