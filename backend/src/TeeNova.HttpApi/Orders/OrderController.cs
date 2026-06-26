using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Orders.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Orders;

[ApiController]
[Route("api/orders")]
[Authorize]
public class OrderController : TeeNovaControllerBase
{
    private readonly IOrderAppService _orderAppService;
    private readonly IOrderProductionPdfService _orderProductionPdfService;

    public OrderController(
        IOrderAppService orderAppService,
        IOrderProductionPdfService orderProductionPdfService)
    {
        _orderAppService = orderAppService;
        _orderProductionPdfService = orderProductionPdfService;
    }

    [HttpPost]
    [AllowAnonymous]
    public async Task<OrderDto> CreateAsync([FromBody] CreateOrderDto input)
        => await _orderAppService.CreateAsync(input);

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<OrderDto> GetAsync(Guid id)
        => await _orderAppService.GetAsync(id);

    [HttpGet]
    public async Task<PagedResultDto<OrderDto>> GetListAsync([FromQuery] GetOrdersInput input)
        => await _orderAppService.GetListAsync(input);

    // Hard-delete. Inherits the controller-level [Authorize]; never exposed anonymously.
    [HttpDelete("{id:guid}")]
    public async Task DeleteAsync(Guid id)
        => await _orderAppService.DeleteAsync(id);

    // Admin production sheet. Intentionally NOT [AllowAnonymous]: it inherits the
    // controller-level [Authorize] so it is unreachable from the anonymous customer
    // order-tracking path that GetAsync above is exposed on.
    [HttpGet("{id:guid}/production-pdf")]
    public async Task<IActionResult> GetProductionPdfAsync(Guid id)
    {
        var result = await _orderProductionPdfService.GenerateAsync(id);
        return File(result.Content, result.ContentType, result.FileName);
    }

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

    [HttpPost("{id:guid}/record-notification")]
    public async Task<OrderDto> RecordNotificationAsync(Guid id)
        => await _orderAppService.RecordNotificationAsync(id);

    [HttpPut("{orderId:guid}/prints/{printId:guid}/design")]
    public async Task<OrderDto> UpdatePrintDesignAsync(Guid orderId, Guid printId, [FromBody] UpdateOrderItemPrintDesignDto input)
        => await _orderAppService.UpdatePrintDesignAsync(orderId, printId, input);

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

    [HttpPost("{id:guid}/record-payment")]
    public async Task<OrderDto> RecordPaymentAsync(Guid id, [FromBody] RecordPaymentDto input)
        => await _orderAppService.RecordPaymentAsync(id, input);

    [HttpPost("{id:guid}/adjust-price")]
    public async Task<OrderDto> AdjustPriceAsync(Guid id, [FromBody] AdjustOrderPriceDto input)
        => await _orderAppService.AdjustPriceAsync(id, input);
}
