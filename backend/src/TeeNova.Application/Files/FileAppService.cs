using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TeeNova.Customization;
using TeeNova.Files.Dtos;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Files;

public class FileAppService : ApplicationService, IFileAppService
{
    private static readonly string[] AllowedContentTypes =
    {
        "image/png",
        "image/jpeg",
        "image/svg+xml",
        "image/webp",
        "application/pdf",
        "application/illustrator",
        "application/postscript",   // .ai files sometimes reported as this
    };

    private static readonly string[] AllowedExtensions =
    {
        ".png", ".jpg", ".jpeg", ".svg", ".webp", ".pdf", ".ai",
    };
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    private readonly IFileStorageService _storageService;
    private readonly IRepository<UploadedAsset, Guid> _assetRepository;
    private readonly IRepository<Order, Guid> _orderRepository;
    private readonly IRepository<OrderItem, Guid> _orderItemRepository;
    private readonly IRepository<OrderItemPositionAsset, Guid> _orderItemPositionAssetRepository;

    public FileAppService(
        IFileStorageService storageService,
        IRepository<UploadedAsset, Guid> assetRepository,
        IRepository<Order, Guid> orderRepository,
        IRepository<OrderItem, Guid> orderItemRepository,
        IRepository<OrderItemPositionAsset, Guid> orderItemPositionAssetRepository)
    {
        _storageService = storageService;
        _assetRepository = assetRepository;
        _orderRepository = orderRepository;
        _orderItemRepository = orderItemRepository;
        _orderItemPositionAssetRepository = orderItemPositionAssetRepository;
    }

    public async Task<UploadFileOutput> UploadAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length == 0)
            throw new UserFriendlyException("No file provided.");

        if (file.Length > MaxFileSizeBytes)
            throw new UserFriendlyException($"File size exceeds the {MaxFileSizeBytes / (1024 * 1024)} MB limit.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentTypeAllowed = Array.Exists(AllowedContentTypes, ct => ct == file.ContentType);
        var extensionAllowed = Array.Exists(AllowedExtensions, e => e == ext);

        if (!contentTypeAllowed && !extensionAllowed)
            throw new UserFriendlyException("Only PNG, JPEG, SVG, WebP, PDF, and AI files are accepted.");

        await using var stream = file.OpenReadStream();
        var fileUrl = await _storageService.SaveAsync(stream, file.FileName, file.ContentType, cancellationToken);

        var asset = new UploadedAsset(
            GuidGenerator.Create(),
            file.FileName,
            fileUrl,
            file.ContentType,
            file.Length
        );

        await _assetRepository.InsertAsync(asset, autoSave: true);

        return new UploadFileOutput
        {
            AssetId = asset.Id,
            FileUrl = fileUrl,
            OriginalFileName = file.FileName,
            FileSizeBytes = file.Length
        };
    }

    public async Task<PagedResultDto<AdminAssetDto>> GetAdminAssetListAsync(PagedResultRequestDto input)
    {
        var totalCount = await _assetRepository.CountAsync();

        var assets = await _assetRepository.GetPagedListAsync(
            input.SkipCount, input.MaxResultCount,
            sorting: "CreationTime DESC");

        var dtos = await EnrichWithOrderDataAsync(assets);

        return new PagedResultDto<AdminAssetDto>(totalCount, dtos);
    }

    public async Task<AdminAssetDto> GetAdminAssetAsync(Guid id)
    {
        var asset = await _assetRepository.GetAsync(id);
        var dtos = await EnrichWithOrderDataAsync([asset]);
        return dtos[0];
    }

    public async Task<CleanOrphanedAssetsResultDto> CleanOrphanedAssetsAsync()
    {
        var allAssets = await _assetRepository.GetListAsync();
        if (allAssets.Count == 0)
            return new CleanOrphanedAssetsResultDto();

        var allAssetIds = allAssets.Select(a => a.Id).ToList();

        var referencedIds = (await _orderItemPositionAssetRepository.GetListAsync(
                p => p.UploadedAssetId != null && allAssetIds.Contains(p.UploadedAssetId!.Value)))
            .Select(p => p.UploadedAssetId!.Value)
            .ToHashSet();

        var orphans = allAssets.Where(a => !referencedIds.Contains(a.Id)).ToList();

        var deleted = 0;
        var failed = 0;

        foreach (var asset in orphans)
        {
            try
            {
                await _storageService.DeleteAsync(asset.StoredFileUrl);
                await _assetRepository.DeleteAsync(asset, autoSave: true);
                deleted++;
            }
            catch
            {
                failed++;
            }
        }

        return new CleanOrphanedAssetsResultDto
        {
            DeletedCount = deleted,
            FailedCount = failed,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task<List<AdminAssetDto>> EnrichWithOrderDataAsync(IEnumerable<UploadedAsset> assets)
    {
        var assetList = assets.ToList();
        var assetIds = assetList.Select(a => a.Id).ToList();

        // Fetch order items that reference any of these assets
        var positionAssetQuery = await _orderItemPositionAssetRepository.GetQueryableAsync();
        var matchedPositionAssets = await positionAssetQuery
            .Where(p => p.UploadedAssetId != null && assetIds.Contains(p.UploadedAssetId.Value))
            .ToListAsync();

        var itemIds = matchedPositionAssets.Select(p => p.OrderItemId)
            .Distinct()
            .ToList();

        var itemQuery = await _orderItemRepository.GetQueryableAsync();
        var matchedItems = itemIds.Count == 0
            ? []
            : await itemQuery.Where(i => itemIds.Contains(i.Id)).ToListAsync();

        var orderIds = matchedItems.Select(i => i.OrderId).Distinct().ToList();

        List<Order> orders = [];
        if (orderIds.Count > 0)
        {
            var orderQuery = await _orderRepository.GetQueryableAsync();
            orders = await orderQuery.Where(o => orderIds.Contains(o.Id)).ToListAsync();
        }

        var orderMap = orders.ToDictionary(o => o.Id);
        var positionAssetsByAssetId = matchedPositionAssets.ToLookup(p => p.UploadedAssetId!.Value);
        var itemMap = matchedItems.ToDictionary(i => i.Id);

        return assetList.Select(asset =>
        {
            var positionAsset = positionAssetsByAssetId[asset.Id].FirstOrDefault();
            var item = positionAsset != null
                ? itemMap.GetValueOrDefault(positionAsset.OrderItemId)
                : null;
            Order? order = item != null && orderMap.TryGetValue(item.OrderId, out var o) ? o : null;

            return MapToDto(asset, item, order, positionAsset);
        }).ToList();
    }

    private static AdminAssetDto MapToDto(
        UploadedAsset asset,
        OrderItem? item,
        Order? order,
        OrderItemPositionAsset? positionAsset)
        => new()
        {
            Id = asset.Id,
            OriginalFileName = asset.OriginalFileName,
            FileUrl = asset.StoredFileUrl,
            ContentType = asset.ContentType,
            FileSizeBytes = asset.FileSizeBytes,
            CreationTime = asset.CreationTime,

            LinkedOrderId = order?.Id,
            LinkedOrderNumber = order?.OrderNumber,
            LinkedCustomerName = order?.CustomerName,
            LinkedOrderItemId = item?.Id,
            LinkedProductName = item?.ProductName,
            PrintPosition = positionAsset?.Position.ToString(),
            DesignNote = positionAsset?.DesignNote,
        };
}
