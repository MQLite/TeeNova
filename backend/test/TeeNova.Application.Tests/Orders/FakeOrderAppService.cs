using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;
using TeeNova.Payments.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Minimal test double for <see cref="IOrderAppService"/>: returns a prepared <see cref="OrderDto"/>
/// snapshot from <see cref="GetAsync"/> and throws for everything else. Lets the production-PDF service
/// be exercised with a fixed snapshot and NO database, repository, catalogue or DI container — which is
/// also the point being asserted: the PDF reads nothing but the order snapshot it is handed.
/// </summary>
public sealed class FakeOrderAppService : IOrderAppService
{
    private readonly OrderDto _order;

    /// <summary>Number of times the PDF service asked for the order (expected: exactly one).</summary>
    public int GetAsyncCallCount { get; private set; }

    public FakeOrderAppService(OrderDto order) => _order = order;

    public Task<OrderDto> GetAsync(Guid id)
    {
        GetAsyncCallCount++;
        return Task.FromResult(_order);
    }

    // ── Everything below is unreachable from the PDF path; a call would be a real defect. ──────────
    private static Exception NotUsed([System.Runtime.CompilerServices.CallerMemberName] string member = "")
        => new InvalidOperationException($"The production PDF path must not call {member}.");

    public Task<OrderDto> CreateAsync(CreateOrderDto input) => throw NotUsed();
    public Task<List<AdminOnlinePaymentSessionDto>> GetAdminOnlinePaymentSessionsAsync(Guid id) => throw NotUsed();
    public Task<PagedResultDto<OrderDto>> GetListAsync(GetOrdersInput input) => throw NotUsed();
    public Task DeleteAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> UpdateStatusAsync(Guid id, UpdateOrderStatusDto input) => throw NotUsed();
    public Task<OrderDto> MarkPaidAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> StartReviewAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> ReopenAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> RecordNotificationAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> UpdatePrintDesignAsync(Guid orderId, Guid printId, UpdateOrderItemPrintDesignDto input) => throw NotUsed();
    public Task<OrderDto> UpdateAdminNotesAsync(Guid id, UpdateAdminNotesDto input) => throw NotUsed();
    public Task<OrderDto> ApproveForPrintingAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> StartPrintingAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> MarkReadyAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> CompleteAsync(Guid id) => throw NotUsed();
    public Task<OrderDto> RecordPaymentAsync(Guid id, RecordPaymentDto input) => throw NotUsed();
    public Task<OnlinePaymentSessionDto> CreateOnlinePaymentSessionAsync(Guid id, CreateOnlinePaymentSessionDto input) => throw NotUsed();
    public Task<OnlinePaymentQuoteDto> GetOnlinePaymentQuoteAsync(Guid id, CreateOnlinePaymentQuoteDto input) => throw NotUsed();
    public Task<OnlinePaymentQuoteDto> GetDraftOnlinePaymentQuoteAsync(CreateDraftOnlinePaymentQuoteDto input) => throw NotUsed();
    public Task<OrderDto> AdjustPriceAsync(Guid id, AdjustOrderPriceDto input) => throw NotUsed();
    public Task<OrderContentQuoteResultDto> QuoteContentUpdateAsync(Guid id, UpdateOrderContentDto input) => throw NotUsed();
    public Task<OrderDto> UpdateContentAsync(Guid id, UpdateOrderContentDto input) => throw NotUsed();
}
