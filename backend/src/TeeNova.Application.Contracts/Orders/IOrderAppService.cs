using System;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TeeNova.Orders;

public interface IOrderAppService : IApplicationService
{
    Task<OrderDto> CreateAsync(CreateOrderDto input);
    Task<OrderDto> GetAsync(Guid id);
    Task<PagedResultDto<OrderDto>> GetListAsync(GetOrdersInput input);
    Task<OrderDto> UpdateStatusAsync(Guid id, UpdateOrderStatusDto input);
    Task<OrderDto> MarkPaidAsync(Guid id);
    Task<OrderDto> StartReviewAsync(Guid id);
    Task<OrderDto> ReopenAsync(Guid id);
    Task<OrderDto> UpdateChecklistAsync(Guid id, UpdateOrderChecklistDto input);
    Task<OrderDto> RecordNotificationAsync(Guid id);
    Task<OrderDto> UpdatePrintDesignAsync(Guid orderId, Guid printId, UpdateOrderItemPrintDesignDto input);
    Task<OrderDto> UpdateAdminNotesAsync(Guid id, UpdateAdminNotesDto input);
    Task<OrderDto> ApproveForPrintingAsync(Guid id);
    Task<OrderDto> StartPrintingAsync(Guid id);
    Task<OrderDto> MarkReadyAsync(Guid id);
    Task<OrderDto> CompleteAsync(Guid id);
}
