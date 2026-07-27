using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;
using TeeNova.Payments.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Orders;

public interface IOrderAppService : IApplicationService
{
    Task<OrderDto> CreateAsync(CreateOrderDto input);
    Task<OrderDto> GetAsync(Guid id);
    Task<List<AdminOnlinePaymentSessionDto>> GetAdminOnlinePaymentSessionsAsync(Guid id);
    Task<PagedResultDto<OrderDto>> GetListAsync(GetOrdersInput input);
    Task DeleteAsync(Guid id);
    Task<OrderDto> UpdateStatusAsync(Guid id, UpdateOrderStatusDto input);
    Task<OrderDto> MarkPaidAsync(Guid id);
    Task<OrderDto> StartReviewAsync(Guid id);
    Task<OrderDto> ReopenAsync(Guid id);
    Task<OrderDto> RecordNotificationAsync(Guid id);
    Task<OrderDto> UpdatePrintDesignAsync(Guid orderId, Guid printId, UpdateOrderItemPrintDesignDto input);
    Task<OrderDto> UpdateAdminNotesAsync(Guid id, UpdateAdminNotesDto input);
    Task<OrderDto> ApproveForPrintingAsync(Guid id);
    Task<OrderDto> StartPrintingAsync(Guid id);
    Task<OrderDto> MarkReadyAsync(Guid id);
    Task<OrderDto> CompleteAsync(Guid id);
    Task<OrderDto> RecordPaymentAsync(Guid id, RecordPaymentDto input);
    Task<OnlinePaymentSessionDto> CreateOnlinePaymentSessionAsync(Guid id, CreateOnlinePaymentSessionDto input);

    // Online payment quoting (Phase 3): read-only surcharge disclosure before any payment session exists.
    // Neither call creates an order, a payment session or a payment record, and neither contacts a provider.
    Task<OnlinePaymentQuoteDto> GetOnlinePaymentQuoteAsync(Guid id, CreateOnlinePaymentQuoteDto input);
    Task<OnlinePaymentQuoteDto> GetDraftOnlinePaymentQuoteAsync(CreateDraftOnlinePaymentQuoteDto input);
    Task<OrderDto> AdjustPriceAsync(Guid id, AdjustOrderPriceDto input);

    // Admin order-content edit (Jira 9405): preview (no persistence) + save (reprice + persist).
    Task<OrderContentQuoteResultDto> QuoteContentUpdateAsync(Guid id, UpdateOrderContentDto input);
    Task<OrderDto> UpdateContentAsync(Guid id, UpdateOrderContentDto input);
}
