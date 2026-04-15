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

    [HttpPut("{orderId:guid}/items/{itemId:guid}/design")]
    public async Task<OrderItemDto> UpdateItemDesignAsync(Guid orderId, Guid itemId, [FromBody] UpdateOrderItemDesignDto input)
        => await _orderAppService.UpdateItemDesignAsync(orderId, itemId, input);
}
