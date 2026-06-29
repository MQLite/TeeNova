using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeeNova.Email;
using TeeNova.Inventory;
using TeeNova.Orders.Dtos;
using TeeNova.Payments;
using TeeNova.Pricing;
using TeeNova.PrintConfig;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Orders;

public class OrderAppService : ApplicationService, IOrderAppService
{
    private readonly IRepository<Order, Guid>                       _orderRepository;
    private readonly IRepository<OrderTimelineEntry, Guid>   _timelineRepository;
    private readonly IRepository<PaymentTransaction, Guid>   _paymentTransactionRepository;
    private readonly IRepository<OrderPriceAdjustment, Guid> _priceAdjustmentRepository;
    private readonly IRepository<OnlinePaymentSession, Guid> _onlinePaymentSessionRepository;
    private readonly IOrderEmailNotificationService          _orderEmailNotificationService;
    private readonly IOptions<OnlinePaymentOptions>          _onlinePaymentOptions;
    private readonly IOnlinePaymentProviderResolver          _onlinePaymentProviderResolver;
    private readonly IHttpContextAccessor                    _httpContextAccessor;
    private readonly IInventorySettingsAppService            _inventorySettings;
    private readonly IInventoryDeductionService              _inventoryDeductionService;
    private readonly OrderContentPricingService              _orderContentPricingService;

    public OrderAppService(
        IRepository<Order, Guid>                 orderRepository,
        IRepository<OrderTimelineEntry, Guid>    timelineRepository,
        IRepository<PaymentTransaction, Guid>    paymentTransactionRepository,
        IRepository<OrderPriceAdjustment, Guid>  priceAdjustmentRepository,
        IRepository<OnlinePaymentSession, Guid>  onlinePaymentSessionRepository,
        IOrderEmailNotificationService           orderEmailNotificationService,
        IOptions<OnlinePaymentOptions>           onlinePaymentOptions,
        IOnlinePaymentProviderResolver           onlinePaymentProviderResolver,
        IHttpContextAccessor                     httpContextAccessor,
        IInventorySettingsAppService             inventorySettings,
        IInventoryDeductionService               inventoryDeductionService,
        OrderContentPricingService               orderContentPricingService)
    {
        _orderRepository                = orderRepository;
        _timelineRepository             = timelineRepository;
        _paymentTransactionRepository   = paymentTransactionRepository;
        _priceAdjustmentRepository      = priceAdjustmentRepository;
        _onlinePaymentSessionRepository = onlinePaymentSessionRepository;
        _orderEmailNotificationService  = orderEmailNotificationService;
        _onlinePaymentOptions           = onlinePaymentOptions;
        _onlinePaymentProviderResolver  = onlinePaymentProviderResolver;
        _httpContextAccessor            = httpContextAccessor;
        _inventorySettings              = inventorySettings;
        _inventoryDeductionService      = inventoryDeductionService;
        _orderContentPricingService     = orderContentPricingService;
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

        // Snapshot the auto-deduction setting now (DB-backed, Jira 9005). Only orders created
        // while the setting is ON are ever eligible for deduction; enabling it later never
        // affects old orders. This does NOT deduct stock and never blocks checkout.
        var inventoryDeductionEligible = (await _inventorySettings.GetAsync()).AutoDeductOnPressedEnabled;

        // Authoritative whole-order pricing via the shared service (Jira 9405): identical resolution to
        // the storefront quote and the admin content-edit paths so prices can never drift.
        var draft = input.Items
            .Select(i => new OrderDraftItem(
                Id: null,
                i.ProductId,
                i.ProductVariantId,
                i.Quantity,
                (i.Prints ?? new List<CreateOrderItemPrintDto>())
                    .Select(p => new OrderDraftPrint(
                        Id: null,
                        p.PrintAreaId, p.PrintSizeId,
                        p.UploadedAssetId, p.UploadedAssetUrl, p.DesignNote, PrintNotes: null))
                    .ToList()))
            .ToList();

        var priced = await _orderContentPricingService.PriceAsync(draft);

        foreach (var pricedItem in priced.Items)
            order.AddItem(BuildOrderItem(order.Id, pricedItem, inventoryDeductionEligible));

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
        await EnrichPriceAdjustmentsAsync(dto);

        // Additive grouped print read model (Jira 9403). Pure projection over the already-loaded
        // Items/Prints snapshot — no DB access, no mutation of the flat items or any price snapshot.
        dto.PrintGroups = OrderPrintGroupBuilder.Build(dto);

        return dto;
    }

    public async Task<OrderDto> AdjustPriceAsync(Guid id, AdjustOrderPriceDto input)
    {
        var order = await _orderRepository.GetAsync(id);

        var oldTotalAmount = order.TotalAmount;

        // Validate and apply the price change first so domain rules (terminal order,
        // below-paid-amount, non-positive total) fail before any side effects are queued.
        order.AdjustPrice(input.NewTotalAmount, Clock.Now);

        // Cancel any Pending online payment sessions; their frozen amounts are now stale.
        var sessionQuery = await _onlinePaymentSessionRepository.GetQueryableAsync();
        var pendingSessions = await sessionQuery
            .Where(s => s.OrderId == id && s.Status == OnlinePaymentSessionStatus.Pending)
            .ToListAsync();

        foreach (var session in pendingSessions)
        {
            session.MarkCancelled(null, "price_adjusted");
            await _onlinePaymentSessionRepository.UpdateAsync(session, autoSave: false);
        }

        var adjustedByUser = _httpContextAccessor.HttpContext?
            .User.FindFirst(ClaimTypes.Name)?.Value;

        var adjustment = new OrderPriceAdjustment(
            GuidGenerator.Create(),
            id,
            oldTotalAmount,
            input.NewTotalAmount,
            input.Reason,
            adjustedByUser);

        await _priceAdjustmentRepository.InsertAsync(adjustment, autoSave: false);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        var direction = input.NewTotalAmount > oldTotalAmount ? "increased" : "decreased";
        var diff      = Math.Abs(input.NewTotalAmount - oldTotalAmount);

        // The full reason is preserved in OrderPriceAdjustment.Reason (up to 1000 chars).
        // The timeline Description column is nvarchar(512), so embed only a short excerpt.
        var reasonExcerpt = input.Reason.Trim();
        if (reasonExcerpt.Length > 120)
            reasonExcerpt = reasonExcerpt[..120] + "...";

        var sessionNote = pendingSessions.Count > 0
            ? $" {pendingSessions.Count} pending payment session(s) cancelled."
            : string.Empty;

        var timelineDesc = $"Order total {direction} by {diff:F2} NZD " +
                           $"({oldTotalAmount:F2} -> {input.NewTotalAmount:F2} NZD). " +
                           $"Reason: {reasonExcerpt}{sessionNote}";

        // Defensive cap: Description column is nvarchar(512).
        if (timelineDesc.Length > 512)
            timelineDesc = timelineDesc[..509] + "...";

        await AddTimelineEntryAsync(id, OrderEventType.PriceAdjusted, timelineDesc, order.Status);

        return await GetAsync(id);
    }

    /// <summary>
    /// Admin-only NON-PERSISTING preview (Jira 9405): re-resolves the WHOLE submitted order draft via the
    /// shared authoritative pricing service and returns the repriced preview order, the regrouped print
    /// read model, and the payment impact. Nothing is saved; no session/status/payment/inventory side
    /// effects occur. Editability problems (terminal/inventory/below-paid) are reported as blocking
    /// reasons rather than thrown, so the edit UI can show them before save. Invalid product/variant/print
    /// selections still throw (an invalid draft cannot be priced/previewed).
    /// </summary>
    public async Task<OrderContentQuoteResultDto> QuoteContentUpdateAsync(Guid id, UpdateOrderContentDto input)
    {
        var order = await LoadOrderWithItemsAsync(id);
        var draft = BuildAndValidateDraft(order, input);

        var priced   = await _orderContentPricingService.PriceAsync(draft);
        var newTotal = priced.TotalAmount;
        var oldTotal = order.TotalAmount;

        var pendingSessionCount = await CountPendingPaymentSessionsAsync(id);
        var payment = BuildPaymentImpact(order, newTotal, pendingSessionCount);

        var warnings = new List<string>();
        if (payment.WouldCancelPendingPaymentSessions)
            warnings.Add($"Saving will cancel {pendingSessionCount} pending online payment session(s).");

        var previewOrder = BuildPreviewOrderDto(order, priced, payment, newTotal);

        return new OrderContentQuoteResultDto
        {
            OldTotalAmount = oldTotal,
            NewTotalAmount = newTotal,
            PreviewOrder   = previewOrder,
            Payment        = payment,
            Warnings       = warnings,
        };
    }

    /// <summary>
    /// Admin-only content save (Jira 9405): validates editability, re-resolves the WHOLE order via the
    /// shared pricing service (never trusting client prices), replaces the item set (replace semantics:
    /// omitted items removed, kept/new items rebuilt from server snapshots), recalculates Total +
    /// payment exactly as <see cref="AdjustPriceAsync"/> does, cancels pending online sessions when the
    /// total changes, writes an audit timeline entry, and returns the fresh <see cref="OrderDto"/>
    /// (with PrintGroups). Rejects Cancelled/Completed orders, inventory-deducted orders, and any new
    /// total below PaidAmount. Does NOT send email, generate a PDF, or deduct inventory.
    /// </summary>
    public async Task<OrderDto> UpdateContentAsync(Guid id, UpdateOrderContentDto input)
    {
        var order = await LoadOrderWithItemsAsync(id);

        // Fail fast on guards before doing any pricing DB work.
        EnsureContentEditable(order);

        var draft  = BuildAndValidateDraft(order, input);
        var priced = await _orderContentPricingService.PriceAsync(draft);

        var oldTotal = order.TotalAmount;

        // All items in an order share the creation-time deduction-eligibility snapshot (Jira 9005);
        // preserve it on the rebuilt rows. (Eligibility != deducted; deducted orders are rejected above.)
        var inventoryDeductionEligible = order.Items.FirstOrDefault()?.InventoryDeductionEligible ?? false;

        var newItems = priced.Items
            .Select(p => BuildOrderItem(order.Id, p, inventoryDeductionEligible))
            .ToList();

        // Domain replace + payment recalc (re-validates terminal/positive/below-paid defensively).
        order.ReplaceItems(newItems, Clock.Now);

        // Cancel any Pending online payment sessions when the total changed; their frozen amounts are
        // now stale. Mirrors AdjustPriceAsync exactly.
        var sessionNote = string.Empty;
        if (order.TotalAmount != oldTotal)
        {
            var sessionQuery = await _onlinePaymentSessionRepository.GetQueryableAsync();
            var pendingSessions = await sessionQuery
                .Where(s => s.OrderId == id && s.Status == OnlinePaymentSessionStatus.Pending)
                .ToListAsync();

            foreach (var session in pendingSessions)
            {
                session.MarkCancelled(null, "order_content_edited");
                await _onlinePaymentSessionRepository.UpdateAsync(session, autoSave: false);
            }

            if (pendingSessions.Count > 0)
                sessionNote = $" {pendingSessions.Count} pending payment session(s) cancelled.";
        }

        await _orderRepository.UpdateAsync(order, autoSave: true);

        var direction = order.TotalAmount > oldTotal ? "increased"
            : order.TotalAmount < oldTotal ? "decreased"
            : "unchanged";

        var timelineDesc = $"Order content updated. Total {direction} " +
                           $"({oldTotal:F2} -> {order.TotalAmount:F2} NZD).{sessionNote}";

        if (timelineDesc.Length > 512)
            timelineDesc = timelineDesc[..509] + "...";

        await AddTimelineEntryAsync(id, OrderEventType.ContentEdited, timelineDesc, order.Status);

        return await GetAsync(id);
    }

    /// <summary>
    /// Permanently deletes an order and everything that references it. The Order aggregate owns its
    /// Items -> Prints (cascaded), but timeline entries, payment transactions, price adjustments and
    /// online payment sessions are independent aggregates keyed by OrderId and are removed explicitly
    /// to avoid orphaned rows. This is a hard delete — financial/audit history for the order is lost.
    /// </summary>
    public async Task DeleteAsync(Guid id)
    {
        // Resolve first so a missing order surfaces a clean 404 rather than silently no-op'ing.
        var order = await _orderRepository.GetAsync(id);

        await _timelineRepository.DeleteAsync(e => e.OrderId == id, autoSave: false);
        await _paymentTransactionRepository.DeleteAsync(t => t.OrderId == id, autoSave: false);
        await _priceAdjustmentRepository.DeleteAsync(a => a.OrderId == id, autoSave: false);
        await _onlinePaymentSessionRepository.DeleteAsync(s => s.OrderId == id, autoSave: false);

        await _orderRepository.DeleteAsync(order, autoSave: true);
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
            "Order activated", OrderStatus.Paid);

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
            ? $"Payment of {input.Amount:F2} NZD recorded via {input.Method}."
            : $"Payment of {input.Amount:F2} NZD recorded via {input.Method}. Ref: {reference}.";

        await AddTimelineEntryAsync(id, OrderEventType.PaymentReceived,
            timelineDesc,
            order.Status);

        // Email is best-effort and must not block payment recording.
        try
        {
            await _orderEmailNotificationService.SendPaymentReceiptAsync(order, transaction);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex,
                "[Email] Unexpected error while sending payment receipt for order {OrderNumber}",
                order.OrderNumber);
        }

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
        // Load Items so the (optional) inventory deduction can run in this same unit of work.
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == id)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), id);

        // MarkReady throws unless the order is currently Printing, so this only ever runs on the
        // genuine Printing -> Ready transition: the first persisted production-complete signal.
        // (No persisted "Pressed" step exists; see implementation report.) This makes the trigger
        // one-way and, with per-item InventoryDeductedAt markers, idempotent.
        order.MarkReady();

        // Optional, idempotent stock deduction (Jira 9005). Never blocks the transition.
        await _inventoryDeductionService.DeductForOrderAsync(order);

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

    public async Task<OnlinePaymentSessionDto> CreateOnlinePaymentSessionAsync(
        Guid id, CreateOnlinePaymentSessionDto input)
    {
        var order = await _orderRepository.GetAsync(id);

        if (order.Status == OrderStatus.Cancelled)
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidOrderState")
                .WithData("OrderId", order.Id)
                .WithData("Reason", "Order is cancelled");

        if (order.Status == OrderStatus.Completed)
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidOrderState")
                .WithData("OrderId", order.Id)
                .WithData("Reason", "Order is completed");

        if (string.IsNullOrWhiteSpace(order.CustomerEmail))
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidOrderState")
                .WithData("OrderId", order.Id)
                .WithData("Reason", "CustomerEmail is missing");

        var opts = _onlinePaymentOptions.Value;

        if (!opts.Enabled)
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentsDisabled");

        // Determine provider: prefer explicit input, fall back to default.
        var selectedProvider = (input.Provider.HasValue && input.Provider.Value != PaymentProvider.None)
            ? input.Provider.Value
            : opts.DefaultProvider;

        if (selectedProvider == PaymentProvider.None)
            throw new Volo.Abp.BusinessException("TeeNova:Payment:PaymentProviderNotSelected");

        // If config entry explicitly disables the provider, reject early.
        if (opts.Providers.TryGetValue(selectedProvider.ToString(), out var providerOpts)
            && !providerOpts.Enabled)
        {
            throw new Volo.Abp.BusinessException("TeeNova:Payment:PaymentProviderDisabled")
                .WithData("Provider", selectedProvider);
        }

        if (string.IsNullOrWhiteSpace(opts.SuccessReturnBaseUrl)
            || string.IsNullOrWhiteSpace(opts.CancelReturnBaseUrl))
        {
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentReturnUrlNotConfigured");
        }

        var (purpose, amount) = CalculatePaymentPurposeAndAmount(order, input.Purpose);

        var currency   = string.IsNullOrWhiteSpace(opts.Currency) ? "NZD" : opts.Currency.ToUpperInvariant();
        var successUrl = $"{opts.SuccessReturnBaseUrl.TrimEnd('/')}?orderId={order.Id}&orderNumber={Uri.EscapeDataString(order.OrderNumber)}&provider={Uri.EscapeDataString(selectedProvider.ToString())}";
        var cancelUrl  = $"{opts.CancelReturnBaseUrl.TrimEnd('/')}?orderId={order.Id}&orderNumber={Uri.EscapeDataString(order.OrderNumber)}&provider={Uri.EscapeDataString(selectedProvider.ToString())}";

        var request = new CreateOnlinePaymentProviderSessionRequest
        {
            OrderId       = order.Id,
            OrderNumber   = order.OrderNumber,
            Provider      = selectedProvider,
            Purpose       = purpose,
            Amount        = amount,
            Currency      = currency,
            CustomerEmail = order.CustomerEmail,
            SuccessUrl    = successUrl,
            CancelUrl     = cancelUrl,
            Metadata      = new Dictionary<string, string>
            {
                ["orderId"]     = order.Id.ToString(),
                ["orderNumber"] = order.OrderNumber,
                ["purpose"]     = purpose.ToString(),
                ["provider"]    = selectedProvider.ToString(),
                ["amount"]      = amount.ToString(CultureInfo.InvariantCulture),
            },
        };

        IOnlinePaymentProvider provider;
        try
        {
            provider = _onlinePaymentProviderResolver.Resolve(selectedProvider);
        }
        catch (InvalidOperationException ex)
        {
            Logger.LogWarning(ex,
                "[OnlinePayment] Provider '{Provider}' not registered for order {OrderNumber}.",
                selectedProvider, order.OrderNumber);

            throw new Volo.Abp.BusinessException("TeeNova:Payment:PaymentProviderNotConfigured")
                .WithData("Provider", selectedProvider);
        }

        var providerResult = await provider.CreatePaymentSessionAsync(request);

        if (providerResult.Provider != selectedProvider
            || string.IsNullOrWhiteSpace(providerResult.ProviderSessionId)
            || string.IsNullOrWhiteSpace(providerResult.ProviderCheckoutUrl))
        {
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentProviderSessionInvalid")
                .WithData("Provider", selectedProvider);
        }

        var session = OnlinePaymentSession.Create(
            GuidGenerator.Create(),
            order.Id,
            order.OrderNumber,
            selectedProvider,
            providerResult.ProviderSessionId,
            providerResult.ProviderCheckoutUrl,
            amount,
            currency,
            purpose);

        await _onlinePaymentSessionRepository.InsertAsync(session, autoSave: true);

        return ObjectMapper.Map<OnlinePaymentSession, OnlinePaymentSessionDto>(session);
    }

    // Private helpers

    private static (PaymentPurpose purpose, decimal amount) CalculatePaymentPurposeAndAmount(
        Order order, PaymentPurpose? requestedPurpose)
    {
        if (order.BalanceAmount <= 0)
            throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentNoAmountDue")
                .WithData("OrderId", order.Id);

        if (order.DeliveryMethod == DeliveryMethod.Shipping)
        {
            if (requestedPurpose.HasValue && requestedPurpose.Value != PaymentPurpose.FullPayment)
                throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidPurpose")
                    .WithData("DeliveryMethod", DeliveryMethod.Shipping)
                    .WithData("RequestedPurpose", requestedPurpose.Value)
                    .WithData("ExpectedPurpose", PaymentPurpose.FullPayment);

            return (PaymentPurpose.FullPayment, order.BalanceAmount);
        }

        if (order.DeliveryMethod == DeliveryMethod.Pickup)
        {
            if (!order.RequiredDepositAmount.HasValue)
                throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidOrderState")
                    .WithData("OrderId", order.Id)
                    .WithData("Reason", "RequiredDepositAmount is null for Pickup order");

            var depositRequired = order.RequiredDepositAmount.Value;

            if (order.PaidAmount < depositRequired)
            {
                // Deposit not yet fully met: collect outstanding deposit amount.
                if (requestedPurpose.HasValue && requestedPurpose.Value != PaymentPurpose.Deposit)
                    throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidPurpose")
                        .WithData("Reason", "Deposit not yet met; purpose must be Deposit")
                        .WithData("RequestedPurpose", requestedPurpose.Value)
                        .WithData("ExpectedPurpose", PaymentPurpose.Deposit);

                var amount = depositRequired - order.PaidAmount;
                return (PaymentPurpose.Deposit, amount);
            }
            else
            {
                // Deposit met: only balance payment is valid.
                if (requestedPurpose.HasValue && requestedPurpose.Value == PaymentPurpose.Deposit)
                    throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidPurpose")
                        .WithData("Reason", "Deposit is already met; use Balance purpose")
                        .WithData("RequestedPurpose", requestedPurpose.Value);

                return (PaymentPurpose.Balance, order.BalanceAmount);
            }
        }

        // Null or unrecognised delivery method.
        throw new Volo.Abp.BusinessException("TeeNova:Payment:OnlinePaymentInvalidOrderState")
            .WithData("OrderId", order.Id)
            .WithData("Reason", "Delivery method is not set or not recognised");
    }

    // Original private helpers

    private static string GetDisplayStatus(OrderStatus status) => status switch
    {
        OrderStatus.Pending      => "Order Received",
        OrderStatus.Paid         => "Activated",
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

    private async Task EnrichPriceAdjustmentsAsync(OrderDto orderDto)
    {
        var adjustments = await _priceAdjustmentRepository.GetListAsync(
            a => a.OrderId == orderDto.Id);

        orderDto.PriceAdjustments = adjustments
            .OrderBy(a => a.CreationTime)
            .Select(a => ObjectMapper.Map<OrderPriceAdjustment, OrderPriceAdjustmentDto>(a))
            .ToList();

        if (orderDto.PriceAdjustments.Count > 0)
        {
            orderDto.HasPriceAdjustment = true;
            var last = orderDto.PriceAdjustments[^1];
            orderDto.LastPriceAdjustedAt       = last.CreationTime;
            orderDto.LastPriceAdjustmentReason = last.Reason;
            orderDto.LastPriceAdjustmentAmount = last.AdjustmentAmount;
        }
    }

    /// <summary>
    /// Builds a fresh <see cref="OrderItem"/> (new ids for the item and every print) from a priced
    /// draft row. Shared by order creation and the admin content-edit save (replace semantics): both
    /// persist server-resolved snapshots only — UnitPrice, ResolvedUnitPrintPrice and the applied tier.
    /// </summary>
    private OrderItem BuildOrderItem(Guid orderId, PricedOrderItem priced, bool inventoryDeductionEligible)
    {
        var item = new OrderItem(
            GuidGenerator.Create(), orderId,
            priced.ProductId, priced.ProductVariantId,
            priced.ProductName, priced.VariantLabel,
            priced.Quantity, priced.UnitPrice)
        {
            InventoryDeductionEligible = inventoryDeductionEligible,
        };

        foreach (var print in priced.Prints)
        {
            item.AddPrint(
                GuidGenerator.Create(),
                print.PrintAreaId, print.PrintAreaName, print.PrintAreaCode, print.PrintAreaPrice,
                print.PrintSizeId, print.PrintSizeName, print.PrintSizeCode, print.PrintSizePrice,
                resolvedUnitPrintPrice: print.ResolvedUnitPrintPrice,
                appliedPrintTierMinQuantity: print.AppliedPrintTierMinQuantity,
                sortOrder: print.SortOrder,
                notes: print.PrintNotes,
                uploadedAssetId: print.UploadedAssetId,
                uploadedAssetUrl: print.UploadedAssetUrl,
                designNote: print.DesignNote);
        }

        return item;
    }

    // ── Admin content-edit helpers (Jira 9405) ──────────────────────────────────

    private async Task<Order> LoadOrderWithItemsAsync(Guid id)
    {
        var query = await _orderRepository.GetQueryableAsync();
        return await query
            .Include(o => o.Items)
            .ThenInclude(i => i.Prints)
            .FirstOrDefaultAsync(o => o.Id == id)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), id);
    }

    /// <summary>
    /// Rejects a content edit on an order that is in a terminal state or whose stock has already been
    /// deducted (Jira 9005). V1 inventory rule (deliberately coarse and safe): if ANY existing item has
    /// <c>InventoryDeductedAt</c> set, the whole content update is rejected — no stock is reversed or
    /// re-deducted here. Granular per-item detection is a future enhancement.
    /// </summary>
    private static void EnsureContentEditable(Order order)
    {
        if (order.Status == OrderStatus.Cancelled || order.Status == OrderStatus.Completed)
            throw new Volo.Abp.BusinessException("TeeNova:Order:CannotEditContentForTerminalOrder")
                .WithData("Status", order.Status);

        if (order.Items.Any(i => i.InventoryDeductedAt != null))
            throw new Volo.Abp.BusinessException("TeeNova:Order:CannotEditContentInventoryDeducted")
                .WithData("OrderId", order.Id);
    }

    /// <summary>
    /// Maps the request to the shared pricing service's draft shape after validating the supplied
    /// item/print ids against the loaded order: existing ids must belong to the order (and a print id to
    /// its specified item); a new item (null id) cannot carry an existing print id; ids must be unique.
    /// </summary>
    private static List<OrderDraftItem> BuildAndValidateDraft(Order order, UpdateOrderContentDto input)
    {
        if (input?.Items == null || input.Items.Count == 0)
            throw new Volo.Abp.BusinessException("TeeNova:Order:OrderMustHaveItems");

        var existingItems = order.Items.ToDictionary(i => i.Id);
        var seenItemIds   = new HashSet<Guid>();
        var seenPrintIds  = new HashSet<Guid>();

        var draft = new List<OrderDraftItem>();

        foreach (var itemDto in input.Items)
        {
            if (itemDto.Quantity <= 0)
                throw new Volo.Abp.BusinessException("TeeNova:Order:ItemQuantityMustBePositive")
                    .WithData("Quantity", itemDto.Quantity);

            OrderItem? existingItem = null;
            if (itemDto.Id.HasValue)
            {
                if (!seenItemIds.Add(itemDto.Id.Value))
                    throw new Volo.Abp.BusinessException("TeeNova:Order:DuplicateOrderItemId")
                        .WithData("OrderItemId", itemDto.Id.Value);

                if (!existingItems.TryGetValue(itemDto.Id.Value, out existingItem))
                    throw new Volo.Abp.BusinessException("TeeNova:Order:OrderItemNotInOrder")
                        .WithData("OrderItemId", itemDto.Id.Value);
            }

            var draftPrints = new List<OrderDraftPrint>();
            foreach (var printDto in itemDto.Prints ?? new List<UpdateOrderItemPrintContentDto>())
            {
                if (printDto.Id.HasValue)
                {
                    if (!seenPrintIds.Add(printDto.Id.Value))
                        throw new Volo.Abp.BusinessException("TeeNova:Order:DuplicateOrderItemPrintId")
                            .WithData("OrderItemPrintId", printDto.Id.Value);

                    // A brand-new item cannot reference an existing print id; an existing print id must
                    // belong to the item it is declared under.
                    if (existingItem == null
                        || existingItem.Prints.All(p => p.Id != printDto.Id.Value))
                        throw new Volo.Abp.BusinessException("TeeNova:Order:OrderItemPrintNotInItem")
                            .WithData("OrderItemPrintId", printDto.Id.Value);
                }

                draftPrints.Add(new OrderDraftPrint(
                    printDto.Id,
                    printDto.PrintAreaId,
                    printDto.PrintSizeId,
                    printDto.UploadedAssetId,
                    printDto.UploadedAssetUrl,
                    printDto.DesignNote,
                    printDto.PrintNotes));
            }

            draft.Add(new OrderDraftItem(
                itemDto.Id,
                itemDto.ProductId,
                itemDto.ProductVariantId,
                itemDto.Quantity,
                draftPrints));
        }

        return draft;
    }

    private async Task<int> CountPendingPaymentSessionsAsync(Guid orderId)
    {
        var sessionQuery = await _onlinePaymentSessionRepository.GetQueryableAsync();
        return await sessionQuery
            .CountAsync(s => s.OrderId == orderId && s.Status == OnlinePaymentSessionStatus.Pending);
    }

    /// <summary>
    /// Computes the previewed payment impact of a new total WITHOUT mutating the order. Mirrors the
    /// recalculation in <see cref="Order.AdjustPrice"/> / <c>ReplaceItems</c> (deposit = 50% ceiling;
    /// PaidAmount unchanged) and reports blocking conditions for the edit UI.
    /// </summary>
    private static PaymentImpactDto BuildPaymentImpact(Order order, decimal newTotal, int pendingSessionCount)
    {
        var paid                = order.PaidAmount;
        var newRequiredPayment  = newTotal;
        decimal? newRequiredDeposit = order.PaymentRequirementType == PaymentRequirementType.DepositThenBalance
            ? Math.Ceiling(newTotal * 0.50m * 100m) / 100m
            : null;
        var newBalance          = newRequiredPayment - paid;
        var totalChanged        = newTotal != order.TotalAmount;

        var blocking = new List<string>();
        if (order.Status == OrderStatus.Cancelled) blocking.Add("OrderCancelled");
        if (order.Status == OrderStatus.Completed) blocking.Add("OrderCompleted");
        if (order.Items.Any(i => i.InventoryDeductedAt != null)) blocking.Add("InventoryAlreadyDeducted");
        if (newTotal <= 0) blocking.Add("NewTotalNotPositive");
        if (newTotal < paid) blocking.Add("NewTotalBelowPaidAmount");

        return new PaymentImpactDto
        {
            PaidAmount               = paid,
            OldBalanceAmount         = order.BalanceAmount,
            NewBalanceAmount         = newBalance,
            OldRequiredPaymentAmount = order.RequiredPaymentAmount,
            NewRequiredPaymentAmount = newRequiredPayment,
            OldRequiredDepositAmount = order.RequiredDepositAmount,
            NewRequiredDepositAmount = newRequiredDeposit,
            CurrentPaymentStatus     = order.PaymentStatus.ToString(),
            PreviewPaymentStatus     = PreviewPaymentStatus(
                                          order.PaymentRequirementType, paid, newRequiredPayment, newRequiredDeposit).ToString(),
            TotalChanged             = totalChanged,
            WouldCancelPendingPaymentSessions = totalChanged && pendingSessionCount > 0,
            IsBlocked                = blocking.Count > 0,
            BlockingReasons          = blocking,
        };
    }

    /// <summary>Pure mirror of <c>Order.RecalculatePaymentStatus</c> for non-persisting previews.</summary>
    private static PaymentStatus PreviewPaymentStatus(
        PaymentRequirementType type, decimal paid, decimal requiredPayment, decimal? requiredDeposit)
    {
        if (paid >= requiredPayment)
            return PaymentStatus.Paid;

        if (type == PaymentRequirementType.DepositThenBalance
            && requiredDeposit.HasValue && paid >= requiredDeposit.Value)
            return PaymentStatus.DepositPaid;

        if (paid > 0m)
            return PaymentStatus.PartiallyPaid;

        return type == PaymentRequirementType.DepositThenBalance
            ? PaymentStatus.DepositRequired
            : PaymentStatus.Unpaid;
    }

    /// <summary>
    /// Builds a non-persisting preview <see cref="OrderDto"/>: the current order mapped, then its items /
    /// total / payment-preview fields overwritten from the priced draft, and PrintGroups rebuilt from the
    /// preview items. Ids on brand-new rows are ephemeral preview ids (real ids are assigned on save).
    /// </summary>
    private OrderDto BuildPreviewOrderDto(Order order, PricedOrderDraft priced, PaymentImpactDto payment, decimal newTotal)
    {
        var dto = ObjectMapper.Map<Order, OrderDto>(order);
        dto.DisplayStatus = GetDisplayStatus(order.Status);

        dto.Items = priced.Items.Select(p => new OrderItemDto
        {
            Id               = p.Id ?? Guid.NewGuid(),
            ProductId        = p.ProductId,
            ProductVariantId = p.ProductVariantId,
            ProductName      = p.ProductName,
            VariantLabel     = p.VariantLabel,
            Quantity         = p.Quantity,
            UnitPrice        = p.UnitPrice,
            Prints           = p.Prints.Select(pr => new OrderItemPrintDto
            {
                Id                          = pr.Id ?? Guid.NewGuid(),
                PrintAreaId                 = pr.PrintAreaId,
                PrintAreaName               = pr.PrintAreaName,
                PrintAreaCode               = pr.PrintAreaCode,
                PrintAreaPrice              = pr.PrintAreaPrice,
                PrintSizeId                 = pr.PrintSizeId,
                PrintSizeName               = pr.PrintSizeName,
                PrintSizeCode               = pr.PrintSizeCode,
                PrintSizePrice              = pr.PrintSizePrice,
                ResolvedUnitPrintPrice      = pr.ResolvedUnitPrintPrice,
                AppliedPrintTierMinQuantity = pr.AppliedPrintTierMinQuantity,
                SortOrder                   = pr.SortOrder,
                Notes                       = pr.PrintNotes,
                UploadedAssetId             = pr.UploadedAssetId,
                UploadedAssetUrl            = pr.UploadedAssetUrl,
                DesignNote                  = pr.DesignNote,
            }).ToList(),
        }).ToList();

        dto.TotalAmount           = newTotal;
        dto.PaidAmount            = payment.PaidAmount;
        dto.RequiredPaymentAmount = payment.NewRequiredPaymentAmount;
        dto.RequiredDepositAmount = payment.NewRequiredDepositAmount;
        dto.BalanceAmount         = payment.NewBalanceAmount;
        dto.PaymentStatus         = Enum.Parse<PaymentStatus>(payment.PreviewPaymentStatus);

        // Regroup the preview content with the same builder the real GET uses (Jira 9403).
        dto.PrintGroups = OrderPrintGroupBuilder.Build(dto);

        return dto;
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
