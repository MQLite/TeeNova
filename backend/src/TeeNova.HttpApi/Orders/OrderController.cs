using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
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

    // Customer checkout: start an online payment session for an existing order.
    // [AllowAnonymous] to mirror the anonymous CreateAsync/GetAsync checkout path above —
    // the customer pays for their own order without an admin login. Previously this was only
    // reachable through the auto-API route /api/app/order/{id}/online-payment-session (Task 8703).
    [HttpPost("{id:guid}/online-payment-session")]
    [AllowAnonymous]
    public async Task<OnlinePaymentSessionDto> CreateOnlinePaymentSessionAsync(
        Guid id, [FromBody] CreateOnlinePaymentSessionDto input)
        => await _orderAppService.CreateOnlinePaymentSessionAsync(id, input);

    [HttpGet]
    public async Task<PagedResultDto<OrderDto>> GetListAsync([FromQuery] GetOrdersInput input)
        => await _orderAppService.GetListAsync(input);

    // Hard-delete. Admin-only mutation (Task 8704); never exposed anonymously.
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
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
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> UpdateStatusAsync(Guid id, [FromBody] UpdateOrderStatusDto input)
        => await _orderAppService.UpdateStatusAsync(id, input);

    [HttpPost("{id:guid}/mark-paid")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> MarkPaidAsync(Guid id)
        => await _orderAppService.MarkPaidAsync(id);

    [HttpPost("{id:guid}/start-review")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> StartReviewAsync(Guid id)
        => await _orderAppService.StartReviewAsync(id);

    [HttpPost("{id:guid}/reopen")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> ReopenAsync(Guid id)
        => await _orderAppService.ReopenAsync(id);

    [HttpPost("{id:guid}/record-notification")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> RecordNotificationAsync(Guid id)
        => await _orderAppService.RecordNotificationAsync(id);

    [HttpPut("{orderId:guid}/prints/{printId:guid}/design")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> UpdatePrintDesignAsync(Guid orderId, Guid printId, [FromBody] UpdateOrderItemPrintDesignDto input)
        => await _orderAppService.UpdatePrintDesignAsync(orderId, printId, input);

    [HttpPut("{id:guid}/notes")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> UpdateAdminNotesAsync(Guid id, [FromBody] UpdateAdminNotesDto input)
        => await _orderAppService.UpdateAdminNotesAsync(id, input);

    [HttpPost("{id:guid}/approve-for-printing")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> ApproveForPrintingAsync(Guid id)
        => await _orderAppService.ApproveForPrintingAsync(id);

    [HttpPost("{id:guid}/start-printing")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> StartPrintingAsync(Guid id)
        => await _orderAppService.StartPrintingAsync(id);

    [HttpPost("{id:guid}/mark-ready")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> MarkReadyAsync(Guid id)
        => await _orderAppService.MarkReadyAsync(id);

    [HttpPost("{id:guid}/complete")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> CompleteAsync(Guid id)
        => await _orderAppService.CompleteAsync(id);

    [HttpPost("{id:guid}/record-payment")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> RecordPaymentAsync(Guid id, [FromBody] RecordPaymentDto input)
        => await _orderAppService.RecordPaymentAsync(id, input);

    [HttpPost("{id:guid}/adjust-price")]
    [Authorize(Roles = TeeNovaRoles.Admin)]
    public async Task<OrderDto> AdjustPriceAsync(Guid id, [FromBody] AdjustOrderPriceDto input)
        => await _orderAppService.AdjustPriceAsync(id, input);
}
