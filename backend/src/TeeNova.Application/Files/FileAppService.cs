using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
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
    // Extension → allowed content types (Jira 9808). Upload is accepted only when BOTH the (normalized)
    // extension is a key here AND the browser-supplied content type is in that key's set — so a mismatched
    // pair (e.g. a .png body sent as application/pdf, or an .exe renamed to .png) is rejected, not accepted
    // on either signal alone. SVG is intentionally NOT allowed: it can carry inline <script>, and these
    // files are served back from /uploads as static content, so an SVG upload would be a stored-XSS vector.
    // .ai is design-production input whose content type is unreliable across editors, so octet-stream is
    // tolerated for it only (never for the raster/pdf types, whose content types are well-defined).
    private static readonly IReadOnlyDictionary<string, string[]> AllowedTypesByExtension =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            [".png"]  = new[] { "image/png" },
            [".jpg"]  = new[] { "image/jpeg" },
            [".jpeg"] = new[] { "image/jpeg" },
            [".webp"] = new[] { "image/webp" },
            [".pdf"]  = new[] { "application/pdf" },
            [".ai"]   = new[] { "application/pdf", "application/postscript", "application/illustrator", "application/octet-stream" },
        };

    private const long MaxFileSizeBytes = 20 * 1024 * 1024; // 20 MB

    private readonly IFileStorageService _storageService;
    private readonly IRepository<UploadedAsset, Guid> _assetRepository;
    private readonly IRepository<Order, Guid> _orderRepository;
    private readonly IRepository<OrderItem, Guid> _orderItemRepository;
    private readonly IRepository<OrderItemPrint, Guid> _orderItemPrintRepository;

    public FileAppService(
        IFileStorageService storageService,
        IRepository<UploadedAsset, Guid> assetRepository,
        IRepository<Order, Guid> orderRepository,
        IRepository<OrderItem, Guid> orderItemRepository,
        IRepository<OrderItemPrint, Guid> orderItemPrintRepository)
    {
        _storageService = storageService;
        _assetRepository = assetRepository;
        _orderRepository = orderRepository;
        _orderItemRepository = orderItemRepository;
        _orderItemPrintRepository = orderItemPrintRepository;
    }

    /// <summary>
    /// Handles customer-side design file uploads (checkout flow).
    /// Files are stored under uploads/designs/ and tracked as <see cref="TeeNova.Files.AssetType.CustomerDesign"/>.
    /// Orphan cleanup applies to these records.
    ///
    /// To add product image upload for admin, create a separate method:
    /// <code>
    /// public async Task&lt;UploadFileOutput&gt; UploadProductImageAsync(IFormFile file, ...)
    /// {
    ///     var fileUrl = await _storageService.SaveAsync(
    ///         stream, file.FileName, file.ContentType,
    ///         folder: "products",               // stored under uploads/products/
    ///         cancellationToken: cancellationToken);
    ///
    ///     var asset = new UploadedAsset(
    ///         GuidGenerator.Create(), file.FileName, fileUrl, file.ContentType, file.Length,
    ///         assetType: AssetType.ProductImage  // excluded from orphan cleanup
    ///     );
    ///     ...
    /// }
    /// </code>
    /// Then expose it via a dedicated endpoint, e.g. POST /api/files/product-image.
    /// </summary>
    public async Task<UploadFileOutput> UploadAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length == 0)
            throw new UserFriendlyException("No file provided.");

        if (file.Length > MaxFileSizeBytes)
            throw new UserFriendlyException($"File size exceeds the {MaxFileSizeBytes / (1024 * 1024)} MB limit.");

        // Require BOTH a known extension AND a content type consistent with that extension (Jira 9808).
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentType = (file.ContentType ?? string.Empty).Trim().ToLowerInvariant();

        if (!AllowedTypesByExtension.TryGetValue(ext, out var allowedTypesForExt))
        {
            // Log the rejection reason only (Jira 9809) — never echo the raw client filename/extension,
            // which is untrusted free text and a log-injection / noise risk.
            Logger.LogWarning("[Upload] Rejected design upload: file extension is not in the allow-list.");
            throw new UserFriendlyException("Only PNG, JPEG, WebP, PDF, and AI files are accepted.");
        }

        if (!Array.Exists(allowedTypesForExt, t => t == contentType))
        {
            Logger.LogWarning("[Upload] Rejected design upload: content type does not match the file extension.");
            throw new UserFriendlyException(
                "The file's content type does not match its extension. Please upload a valid PNG, JPEG, WebP, PDF, or AI file.");
        }

        // Use the validated, normalized content type (guaranteed non-null and in the allow-list) for both
        // storage and the tracked record, rather than the raw nullable IFormFile.ContentType.
        await using var stream = file.OpenReadStream();
        var fileUrl = await _storageService.SaveAsync(
            stream, file.FileName, contentType,
            folder: "designs",
            fileNamePrefix: "designs",
            cancellationToken: cancellationToken);

        var asset = new UploadedAsset(
            GuidGenerator.Create(),
            file.FileName,
            fileUrl,
            contentType,
            file.Length,
            assetType: TeeNova.Files.AssetType.CustomerDesign
        );

        await _assetRepository.InsertAsync(asset, autoSave: true);

        // Safe observability (Jira 9809): only server-controlled values — the new asset id, the validated
        // content type, the byte size, and the server-generated root-relative /uploads URL. The raw
        // original filename is intentionally NOT logged.
        Logger.LogInformation(
            "[Upload] Stored design asset {AssetId} ({ContentType}, {SizeBytes} bytes) at {FileUrl}.",
            asset.Id, contentType, file.Length, fileUrl);

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
        // Only inspect customer design uploads — product images are never auto-deleted.
        var allAssets = await _assetRepository.GetListAsync(
            a => a.AssetType == TeeNova.Files.AssetType.CustomerDesign);
        if (allAssets.Count == 0)
            return new CleanOrphanedAssetsResultDto();

        var allAssetIds = allAssets.Select(a => a.Id).ToList();

        var referencedIds = (await _orderItemPrintRepository.GetListAsync(
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

        // Fetch OrderItemPrint records that reference any of these assets
        var printQuery = await _orderItemPrintRepository.GetQueryableAsync();
        var matchedPrints = await printQuery
            .Where(p => p.UploadedAssetId != null && assetIds.Contains(p.UploadedAssetId.Value))
            .ToListAsync();

        var itemIds = matchedPrints.Select(p => p.OrderItemId)
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
        var printsByAssetId = matchedPrints.ToLookup(p => p.UploadedAssetId!.Value);
        var itemMap = matchedItems.ToDictionary(i => i.Id);

        return assetList.Select(asset =>
        {
            var print = printsByAssetId[asset.Id].FirstOrDefault();
            var item = print != null
                ? itemMap.GetValueOrDefault(print.OrderItemId)
                : null;
            Order? order = item != null && orderMap.TryGetValue(item.OrderId, out var o) ? o : null;

            return MapToDto(asset, item, order, print);
        }).ToList();
    }

    private static AdminAssetDto MapToDto(
        UploadedAsset asset,
        OrderItem? item,
        Order? order,
        OrderItemPrint? print)
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
            PrintAreaName = print?.PrintAreaName,
            DesignNote = print?.DesignNote,
        };
}
