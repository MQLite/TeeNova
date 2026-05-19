using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Email;
using TeeNova.Orders.Dtos;
using TeeNova.Pricing;
using TeeNova.PrintConfig;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Orders;

public class OrderAppService : ApplicationService, IOrderAppService
{
    private readonly IRepository<Order, Guid>               _orderRepository;
    private readonly IRepository<Catalog.Product, Guid>     _productRepository;
    private readonly IRepository<OrderTimelineEntry, Guid>  _timelineRepository;
    private readonly IRepository<PaymentTransaction, Guid>  _paymentTransactionRepository;
    private readonly IRepository<PrintArea, Guid>           _printAreaRepository;
    private readonly IRepository<PrintSize, Guid>           _printSizeRepository;
    private readonly PrintConfigValidator                    _printConfigValidator;
    private readonly IOrderEmailNotificationService          _orderEmailNotificationService;

    public OrderAppService(
        IRepository<Order, Guid>               orderRepository,
        IRepository<Catalog.Product, Guid>     productRepository,
        IRepository<OrderTimelineEntry, Guid>  timelineRepository,
        IRepository<PaymentTransaction, Guid>  paymentTransactionRepository,
        IRepository<PrintArea, Guid>           printAreaRepository,
        IRepository<PrintSize, Guid>           printSizeRepository,
        PrintConfigValidator                   printConfigValidator,
        IOrderEmailNotificationService         orderEmailNotificationService)
    {
        _orderRepository               = orderRepository;
        _productRepository             = productRepository;
        _timelineRepository            = timelineRepository;
        _paymentTransactionRepository  = paymentTransactionRepository;
        _printAreaRepository           = printAreaRepository;
        _printSizeRepository           = printSizeRepository;
        _printConfigValidator          = printConfigValidator;
        _orderEmailNotificationService = orderEmailNotificationService;
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

        order.InitializePaymentRequirement();
        await _orderRepository.InsertAsync(order, autoSave: true);

        await AddTimelineEntryAsync(order.Id, OrderEventType.StatusChanged,
            "Order placed", order.Status);

        // Email is best-effort. autoSave has flushed changes, but the UnitOfWork transaction
        // may commit only after this method returns. For MVP we accept this small edge-case risk.
        try
        {
            await _orderEmailNotificationService.SendOrderConfirmationAsync(order);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Unexpected error while sending customer confirmation for order {OrderNumber}",
                order.OrderNumber);
        }

        try
        {
            await _orderEmailNotificationService.SendAdminNewOrderNotificationAsync(order);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Unexpected error while sending admin notification for order {OrderNumber}",
                order.OrderNumber);
        }

        return ObjectMapper.Map<Order, OrderDto>(order);
    }

    public async Task<OrderDto> GetAsync(Guid id)
    {
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.Prints)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), id);

        var dto = ObjectMapper.Map<Order, OrderDto>(order);
        dto.DisplayStatus = GetDisplayStatus(order.Status);
        await EnrichTimelineAsync(dto);
        await EnrichPaymentTransactionsAsync(dto);
        return dto;
    }

    public async Task<PagedResultDto<OrderDto>> GetListAsync(GetOrdersInput input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        query = query
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
        }

        return new PagedResultDto<OrderDto>(totalCount, dtos);
    }

    public async Task<OrderDto> UpdatePrintDesignAsync(Guid orderId, Guid printId, UpdateOrderItemPrintDesignDto input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.Prints)
            .FirstOrDefaultAsync(o => o.Id == orderId)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), orderId);

        EnsureOrderMutable(order);

        var item = order.Items.FirstOrDefault(i => i.Prints.Any(p => p.Id == printId))
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(OrderItemPrint), printId);

        item.UpdatePrintDesign(
            printId,
            input.UploadedAssetId,
            input.UploadedAssetUrl,
            input.DesignNote);

        await _orderRepository.UpdateAsync(order, autoSave: true);

        return await GetAsync(orderId);
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
    {
        var order = await _orderRepository.GetAsync(id);

        if (order.PaymentRequirementType == PaymentRequirementType.FullPaymentRequired
            && order.PaymentStatus != PaymentStatus.Paid)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:FullPaymentNotMet")
                .WithData("RequiredPaymentAmount", order.RequiredPaymentAmount)
                .WithData("PaidAmount", order.PaidAmount);
        }

        if (order.PaymentRequirementType == PaymentRequirementType.DepositThenBalance
            && order.PaidAmount < order.RequiredDepositAmount)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:DepositPaymentNotMet")
                .WithData("RequiredDepositAmount", order.RequiredDepositAmount)
                .WithData("PaidAmount", order.PaidAmount);
        }

        order.UpdateStatus(OrderStatus.Paid);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            "Order marked as paid", OrderStatus.Paid);

        return await GetAsync(id);
    }

    public async Task<OrderDto> RecordPaymentAsync(Guid id, RecordPaymentDto input)
    {
        var order = await _orderRepository.GetAsync(id);

        if (order.Status == OrderStatus.Cancelled)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:CancelledOrderImmutable")
                .WithData("OrderId", order.Id);
        }

        if (order.Status == OrderStatus.Completed)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:CannotRecordPaymentForCompletedOrder")
                .WithData("OrderId", order.Id);
        }

        var reference = string.IsNullOrWhiteSpace(input.Reference) ? null : input.Reference.Trim();
        var note      = string.IsNullOrWhiteSpace(input.Note)      ? null : input.Note.Trim();

        if (input.Amount > order.BalanceAmount)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Order:PaymentExceedsBalance")
                .WithData("BalanceAmount", order.BalanceAmount)
                .WithData("Amount", input.Amount);
        }

        order.ApplyPayment(input.Amount, input.Method, reference, note, Clock.Now);

        var transaction = new PaymentTransaction(
            GuidGenerator.Create(), order.Id,
            input.Amount, input.Method, reference, note);

        await _paymentTransactionRepository.InsertAsync(transaction, autoSave: false);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        var timelineDesc = string.IsNullOrEmpty(reference)
            ? $"Payment of {input.Amount:C} recorded via {input.Method}."
            : $"Payment of {input.Amount:C} recorded via {input.Method}. Ref: {reference}.";

        await AddTimelineEntryAsync(id, OrderEventType.PaymentReceived,
            timelineDesc,
            order.Status);

        return await GetAsync(id);
    }

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

        // Email is best-effort and must not block the status update.
        try
        {
            await _orderEmailNotificationService.SendOrderReadyAsync(order);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Unexpected error while sending ready notification for order {OrderNumber}",
                order.OrderNumber);
        }

        return await GetAsync(id);
    }

    public async Task<OrderDto> CompleteAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.Complete();
        await _orderRepository.UpdateAsync(order, autoSave: true);

        await AddTimelineEntryAsync(id, OrderEventType.StatusChanged,
            "Order completed", OrderStatus.Completed);

        // Email is best-effort and must not block the status update.
        try
        {
            await _orderEmailNotificationService.SendOrderCompletedAsync(order);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Unexpected error while sending completed notification for order {OrderNumber}",
                order.OrderNumber);
        }

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

    private async Task EnrichPaymentTransactionsAsync(OrderDto orderDto)
    {
        var transactions = await _paymentTransactionRepository.GetListAsync(
            t => t.OrderId == orderDto.Id);

        orderDto.PaymentTransactions = transactions
            .OrderBy(t => t.CreationTime)
            .Select(t => ObjectMapper.Map<PaymentTransaction, PaymentTransactionDto>(t))
            .ToList();
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
        var pairs  = new List<(PrintArea Area, PrintSize Size)>();

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

            pairs.Add((area, size));
            result.Add(new LoadedOrderItemPrint(
                area,
                size,
                dto.UploadedAssetId,
                dto.UploadedAssetUrl,
                dto.DesignNote));
        }

        // Validate that each (PrintArea, PrintSize) pair has an active PrintAreaSizeOption.
        // Uses a single batch query across all pairs.
        await _printConfigValidator.ValidatePrintCombinationsAsync(pairs);

        return result;
    }

    /// <summary>
    /// Writes OrderItemPrint records onto the item from already-loaded entities.
    /// Synchronous — no DB access, entities were loaded by LoadOrderItemPrintsAsync.
    /// </summary>
    private void AddPrintsToItem(OrderItem item, IReadOnlyList<LoadedOrderItemPrint> prints)
    {
        var sortOrder = 0;
        foreach (var print in prints)
        {
            item.AddPrint(
                GuidGenerator.Create(),
                print.Area.Id, print.Area.Name, print.Area.Code, print.Area.BasePrice,
                print.Size.Id, print.Size.Name, print.Size.Code, print.Size.BasePrice,
                sortOrder++,
                uploadedAssetId: print.UploadedAssetId,
                uploadedAssetUrl: print.UploadedAssetUrl,
                designNote: print.DesignNote);
        }
    }

    private record LoadedOrderItemPrint(
        PrintArea Area,
        PrintSize Size,
        Guid? UploadedAssetId,
        string? UploadedAssetUrl,
        string? DesignNote);

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
