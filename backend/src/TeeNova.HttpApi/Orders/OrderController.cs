using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Orders.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Orders;

[ApiController]
[Route("api/orders")]
public class OrderController : TeeNovaControllerBase
{
    private readonly IOrderAppService _orderAppService;

    public OrderController(IOrderAppService orderAppService)
    {
        _orderAppService = orderAppService;
    }

    [HttpPost]
    public async Task<OrderDto> CreateAsync([FromBody] CreateOrderDto input)
        => await _orderAppService.CreateAsync(input);

    [HttpGet("{id:guid}")]
    public async Task<OrderDto> GetAsync(Guid id)
        => await _orderAppService.GetAsync(id);

    [HttpGet]
    public async Task<PagedResultDto<OrderDto>> GetListAsync([FromQuery] GetOrdersInput input)
        => await _orderAppService.GetListAsync(input);

    [HttpPut("{id:guid}/status")]
    public async Task<OrderDto> UpdateStatusAsync(Guid id, [FromBody] UpdateOrderStatusDto input)
        => await _orderAppService.UpdateStatusAsync(id, input);

    [HttpPost("{id:guid}/mark-paid")]
    public async Task<OrderDto> MarkPaidAsync(Guid id)
        => await _orderAppService.MarkPaidAsync(id);

    [HttpPost("{id:guid}/start-review")]
    public async Task<OrderDto> StartReviewAsync(Guid id)
        => await _orderAppService.StartReviewAsync(id);

    [HttpPost("{id:guid}/reopen")]
    public async Task<OrderDto> ReopenAsync(Guid id)
        => await _orderAppService.ReopenAsync(id);

    [HttpPut("{id:guid}/checklist")]
    public async Task<OrderDto> UpdateChecklistAsync(Guid id, [FromBody] UpdateOrderChecklistDto input)
        => await _orderAppService.UpdateChecklistAsync(id, input);

    [HttpPost("{id:guid}/record-notification")]
    public async Task<OrderDto> RecordNotificationAsync(Guid id)
        => await _orderAppService.RecordNotificationAsync(id);

    [HttpPut("{orderId:guid}/items/{itemId:guid}/design")]
    public async Task<OrderItemDto> UpdateItemDesignAsync(Guid orderId, Guid itemId, [FromBody] UpdateOrderItemDesignDto input)
        => await _orderAppService.UpdateItemDesignAsync(orderId, itemId, input);

    [HttpPut("{id:guid}/notes")]
    public async Task<OrderDto> UpdateAdminNotesAsync(Guid id, [FromBody] UpdateAdminNotesDto input)
        => await _orderAppService.UpdateAdminNotesAsync(id, input);

    [HttpPost("{id:guid}/approve-for-printing")]
    public async Task<OrderDto> ApproveForPrintingAsync(Guid id)
        => await _orderAppService.ApproveForPrintingAsync(id);

    [HttpPost("{id:guid}/start-printing")]
    public async Task<OrderDto> StartPrintingAsync(Guid id)
        => await _orderAppService.StartPrintingAsync(id);

    [HttpPost("{id:guid}/mark-ready")]
    public async Task<OrderDto> MarkReadyAsync(Guid id)
        => await _orderAppService.MarkReadyAsync(id);

    [HttpPost("{id:guid}/complete")]
    public async Task<OrderDto> CompleteAsync(Guid id)
        => await _orderAppService.CompleteAsync(id);
}
