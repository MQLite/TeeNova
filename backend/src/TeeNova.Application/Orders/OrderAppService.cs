using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Customization;
using TeeNova.Orders.Dtos;
using TeeNova.Pricing;
using TeeNova.PrintConfig;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Orders;

public class OrderAppService : ApplicationService, IOrderAppService
{
    private readonly IRepository<Order, Guid> _orderRepository;
    private readonly IRepository<Catalog.Product, Guid> _productRepository;
    private readonly IRepository<UploadedAsset, Guid> _assetRepository;
    private readonly IRepository<OrderTimelineEntry, Guid> _timelineRepository;
    private readonly IRepository<PrintArea, Guid> _printAreaRepository;
    private readonly IRepository<PrintSize, Guid> _printSizeRepository;

    public OrderAppService(
        IRepository<Order, Guid> orderRepository,
        IRepository<Catalog.Product, Guid> productRepository,
        IRepository<UploadedAsset, Guid> assetRepository,
        IRepository<OrderTimelineEntry, Guid> timelineRepository,
        IRepository<PrintArea, Guid> printAreaRepository,
        IRepository<PrintSize, Guid> printSizeRepository)
    {
        _orderRepository = orderRepository;
        _productRepository = productRepository;
        _assetRepository = assetRepository;
        _timelineRepository = timelineRepository;
        _printAreaRepository = printAreaRepository;
        _printSizeRepository = printSizeRepository;
    }

    public async Task<OrderDto> CreateAsync(CreateOrderDto input)
    {
        var address = new ShippingAddress(
            input.ShippingAddress.FullName,
            input.ShippingAddress.AddressLine1,
            input.ShippingAddress.City,
            input.ShippingAddress.State,
            input.ShippingAddress.PostalCode,
            input.ShippingAddress.Country,
            input.ShippingAddress.AddressLine2,
            input.ShippingAddress.Phone);

        var customerName = input.ShippingAddress.FullName;
        var order = new Order(GuidGenerator.Create(), customerName, input.CustomerEmail, address)
        {
            Notes = input.Notes,
            DeliveryMethod = input.DeliveryMethod,
        };

        foreach (var itemDto in input.Items)
        {
            var productQuery = await _productRepository.GetQueryableAsync();
            var product = await productQuery
                .Include(p => p.Variants)
                .FirstOrDefaultAsync(p => p.Id == itemDto.ProductId)
                ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(
                    typeof(Catalog.Product), itemDto.ProductId);

            var variant = product.Variants.FirstOrDefault(v => v.Id == itemDto.ProductVariantId)
                ?? throw new Volo.Abp.BusinessException("TeeNova:Catalog:VariantNotFound");

            // Load prints first so their prices feed into the final unit price before
            // OrderItem is constructed (unit price is immutable after construction).
            var loadedPrints = itemDto.Prints?.Count > 0
                ? await LoadOrderItemPrintsAsync(itemDto.Prints)
                : [];

            var printAddOnTotal = loadedPrints.Sum(p => p.Area.BasePrice + p.Size.BasePrice);
            var unitPrice = product.BasePrice + variant.PriceAdjustment + printAddOnTotal;
            var variantLabel = $"{variant.Color} / {variant.Size}";

            var item = new OrderItem(
                GuidGenerator.Create(), order.Id,
                product.Id, variant.Id,
                product.Name, variantLabel,
                itemDto.Quantity, unitPrice);

            if (itemDto.PrintPositions?.Count > 0)
                SyncPositionAssets(item, itemDto.PrintPositions);

            AddPrintsToItem(item, loadedPrints);

            order.AddItem(item);

            Logger.LogInformation(
                "[OrderPricing] OrderId={OrderId} ProductId={ProductId} ProductVariantId={ProductVariantId} Quantity={Quantity} PrintCount={PrintCount} UnitPrice={UnitPrice} LineTotal={LineTotal}",
                order.Id,
                product.Id,
                variant.Id,
                itemDto.Quantity,
                loadedPrints.Count,
                unitPrice,
                unitPrice * itemDto.Quantity);
        }

        await _orderRepository.InsertAsync(order, autoSave: true);

        await AddTimelineEntryAsync(order.Id, OrderEventType.StatusChanged,
            "Order placed", order.Status);

        return ObjectMapper.Map<Order, OrderDto>(order);
    }

    public async Task<OrderDto> GetAsync(Guid id)
    {
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .Include(o => o.Items)
            .ThenInclude(i => i.Prints)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), id);

        var dto = ObjectMapper.Map<Order, OrderDto>(order);
        dto.DisplayStatus = GetDisplayStatus(order.Status);
        await EnrichPositionAssetsAsync(dto);
        await EnrichTimelineAsync(dto);
        return dto;
    }

    public async Task<PagedResultDto<OrderDto>> GetListAsync(GetOrdersInput input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        query = query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .Include(o => o.Items)
            .ThenInclude(i => i.Prints);

        // TODO: apply input.Status, input.Search, input.DateFrom, input.DateTo filters

        var totalCount = await query.CountAsync();
        var orders = await query
            .OrderByDescending(o => o.CreationTime)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        var dtos = ObjectMapper.Map<List<Order>, List<OrderDto>>(orders);

        foreach (var (dto, order) in dtos.Zip(orders))
        {
            dto.DisplayStatus = GetDisplayStatus(order.Status);
            await EnrichPositionAssetsAsync(dto);
        }

        return new PagedResultDto<OrderDto>(totalCount, dtos);
    }

    public async Task<OrderItemDto> UpdateItemDesignAsync(Guid orderId, Guid itemId, UpdateOrderItemDesignDto input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .Include(o => o.Items)
            .ThenInclude(i => i.Prints)
            .FirstOrDefaultAsync(o => o.Id == orderId)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), orderId);

        if (order.Status == OrderStatus.Cancelled)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:CancelledOrderImmutable")
                .WithData("OrderId", orderId);
        }

        var item = order.Items.FirstOrDefault(i => i.Id == itemId)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(OrderItem), itemId);

        item.UpsertPositionAsset(
            GuidGenerator.Create(),
            input.Position,
            input.UploadedAssetId,
            input.UploadedAssetUrl,
            input.DesignNote);

        await _orderRepository.UpdateAsync(order, autoSave: true);

        return ObjectMapper.Map<OrderItem, OrderItemDto>(item);
    }

    public async Task<OrderDto> UpdateStatusAsync(Guid id, UpdateOrderStatusDto input)
    {
        return await ChangeStatusAsync(id, input.NewStatus);
    }

    public async Task<OrderDto> UpdateAdminNotesAsync(Guid id, UpdateAdminNotesDto input)
    {
        var order = await _orderRepository.GetAsync(id);
        EnsureOrderMutable(order);
        order.AdminNotes = input.AdminNotes;
        await _orderRepository.UpdateAsync(order, autoSave: true);
        return await GetAsync(id);
    }

    public async Task<OrderDto> MarkPaidAsync(Guid id)
        => await ChangeStatusAsync(id, OrderStatus.Paid);

    public async Task<OrderDto> StartReviewAsync(Guid id)
        => await ChangeStatusAsync(id, OrderStatus.Reviewing);

    public async Task<OrderDto> ApproveForPrintingAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.ApproveForPrinting();
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.ApprovedForPrinting,
            "Design approved for printing");

        return await GetAsync(id);
    }

    public async Task<OrderDto> StartPrintingAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.StartPrinting();
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            "Printing started", OrderStatus.Printing);

        return await GetAsync(id);
    }

    public async Task<OrderDto> MarkReadyAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.MarkReady();
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            "Order marked as Ready", OrderStatus.Ready);

        return await GetAsync(id);
    }

    public async Task<OrderDto> CompleteAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.Complete();
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            "Order completed", OrderStatus.Completed);

        return await GetAsync(id);
    }

    public async Task<OrderDto> ReopenAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.Reopen(Clock.Now);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            "Order reopened", OrderStatus.Pending);

        return await GetAsync(id);
    }

    public async Task<OrderDto> UpdateChecklistAsync(Guid id, UpdateOrderChecklistDto input)
    {
        var order = await _orderRepository.GetAsync(id);
        EnsureOrderMutable(order);
        order.UpdatePreparationChecklist(
            input.IsDesignReviewed,
            input.IsPrintPositionConfirmed,
            input.IsFileDownloaded,
            input.IsGarmentConfirmed,
            input.IsReadyToPrint);

        await _orderRepository.UpdateAsync(order, autoSave: true);

        return await GetAsync(id);
    }

    public async Task<OrderDto> RecordNotificationAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        if (order.Status != OrderStatus.Ready)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:NotificationRequiresReadyStatus")
                .WithData("CurrentStatus", order.Status);
        }

        await AddTimelineEntryAsync(
            id,
            OrderEventType.CustomerNotificationRecorded,
            "Customer notification placeholder recorded for pickup readiness (no message sent)",
            order.Status);

        return await GetAsync(id);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static string GetDisplayStatus(OrderStatus status) => status switch
    {
        OrderStatus.Pending      => "Order Received",
        OrderStatus.Paid         => "Order Received",
        OrderStatus.Reviewing    => "Processing",
        OrderStatus.Printing     => "In Production",
        OrderStatus.Ready        => "Ready for Pickup",
        OrderStatus.Completed    => "Completed",
        OrderStatus.Cancelled    => "Cancelled",
        _                        => status.ToString(),
    };

    private async Task AddTimelineEntryAsync(
        Guid orderId,
        OrderEventType eventType,
        string description,
        OrderStatus? status = null)
    {
        var entry = new OrderTimelineEntry(
            GuidGenerator.Create(), orderId, eventType, description, status);
        await _timelineRepository.InsertAsync(entry, autoSave: true);
    }

    private async Task EnrichTimelineAsync(OrderDto orderDto)
    {
        var entries = await _timelineRepository.GetListAsync(
            e => e.OrderId == orderDto.Id);

        orderDto.Timeline = entries
            .OrderBy(e => e.CreationTime)
            .Select(e => ObjectMapper.Map<OrderTimelineEntry, OrderTimelineEntryDto>(e))
            .ToList();
    }

    private async Task EnrichPositionAssetsAsync(OrderDto orderDto)
    {
        var assetIds = orderDto.Items
            .SelectMany(i => i.PositionAssets)
            .Where(p => p.UploadedAssetId.HasValue)
            .Select(p => p.UploadedAssetId!.Value)
            .Distinct()
            .ToList();

        if (assetIds.Count == 0) return;

        var assets = await _assetRepository.GetListAsync(a => assetIds.Contains(a.Id));
        var assetMap = assets.ToDictionary(a => a.Id);

        foreach (var item in orderDto.Items)
        {
            foreach (var posAsset in item.PositionAssets)
            {
                if (posAsset.UploadedAssetId.HasValue &&
                    assetMap.TryGetValue(posAsset.UploadedAssetId.Value, out var asset))
                {
                    posAsset.OriginalFileName = asset.OriginalFileName;
                    posAsset.FileName = TryGetFileName(asset.StoredFileUrl);
                    posAsset.FileSizeBytes = asset.FileSizeBytes;
                }
            }
        }
    }

    private static string? TryGetFileName(string? fileUrl)
    {
        if (string.IsNullOrWhiteSpace(fileUrl))
        {
            return null;
        }

        if (Uri.TryCreate(fileUrl, UriKind.Absolute, out var uri))
        {
            return Path.GetFileName(uri.AbsolutePath);
        }

        return Path.GetFileName(fileUrl);
    }

    /// <summary>
    /// Loads and validates PrintArea + PrintSize for each requested print.
    /// Returns a list of loaded entity pairs; prices are used for unit price
    /// calculation before OrderItem is constructed.
    /// </summary>
    private async Task<List<LoadedOrderItemPrint>> LoadOrderItemPrintsAsync(
        IEnumerable<CreateOrderItemPrintDto> printDtos)
    {
        var result = new List<LoadedOrderItemPrint>();

        foreach (var dto in printDtos)
        {
            var area = await _printAreaRepository.FindAsync(dto.PrintAreaId)
                ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(
                    typeof(PrintArea), dto.PrintAreaId);

            if (!area.IsActive)
                throw new Volo.Abp.BusinessException("TeeNova:PrintConfig:PrintAreaInactive")
                    .WithData("PrintAreaId", dto.PrintAreaId)
                    .WithData("PrintAreaName", area.Name);

            var size = await _printSizeRepository.FindAsync(dto.PrintSizeId)
                ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(
                    typeof(PrintSize), dto.PrintSizeId);

            if (!size.IsActive)
                throw new Volo.Abp.BusinessException("TeeNova:PrintConfig:PrintSizeInactive")
                    .WithData("PrintSizeId", dto.PrintSizeId)
                    .WithData("PrintSizeName", size.Name);

            result.Add(new LoadedOrderItemPrint(area, size));
        }

        return result;
    }

    /// <summary>
    /// Writes OrderItemPrint records onto the item from already-loaded entities.
    /// Synchronous — no DB access, entities were loaded by LoadOrderItemPrintsAsync.
    /// </summary>
    private void AddPrintsToItem(OrderItem item, IReadOnlyList<LoadedOrderItemPrint> prints)
    {
        var sortOrder = 0;
        foreach (var (area, size) in prints)
        {
            item.AddPrint(
                GuidGenerator.Create(),
                area.Id, area.Name, area.Code, area.BasePrice,
                size.Id, size.Name, size.Code, size.BasePrice,
                sortOrder++);
        }
    }

    private record LoadedOrderItemPrint(PrintArea Area, PrintSize Size);

    private static void SyncPositionAssets(OrderItem item, IEnumerable<CreateOrderItemPositionDto> positions)
    {
        item.SetPositionAssets(
            positions.Select(position => new OrderItemPositionAsset(
                Guid.NewGuid(),
                item.Id,
                ParsePosition(position.Position),
                position.AssetId,
                position.AssetUrl,
                position.DesignNote)));
    }

    private static PrintPosition ParsePosition(string rawPosition)
    {
        if (Enum.TryParse<PrintPosition>(rawPosition, ignoreCase: true, out var position))
            return position;

        throw new Volo.Abp.BusinessException("TeeNova:Order:InvalidPrintPosition")
            .WithData("Position", rawPosition);
    }

    private async Task<OrderDto> ChangeStatusAsync(Guid id, OrderStatus newStatus)
    {
        if (newStatus is OrderStatus.Printing or OrderStatus.Ready or OrderStatus.Completed)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:StatusRequiresDedicatedAction")
                .WithData("RequestedStatus", newStatus);
        }

        var order = await _orderRepository.GetAsync(id);
        order.UpdateStatus(newStatus);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            $"Status changed to {newStatus}", newStatus);

        return await GetAsync(id);
    }

    private static void EnsureOrderMutable(Order order)
    {
        if (order.Status == OrderStatus.Cancelled)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:CancelledOrderImmutable")
                .WithData("OrderId", order.Id);
        }
    }
}
