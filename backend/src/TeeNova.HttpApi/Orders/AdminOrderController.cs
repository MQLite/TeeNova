using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TeeNova.Auth;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Admin-only order-content editing surface (Jira 9405). Deliberately separate from the shared
/// <see cref="OrderController"/> at <c>api/orders</c> (whose GET/POST are <c>[AllowAnonymous]</c> for
/// customer tracking / checkout). Every action here inherits the controller-level <see cref="AuthorizeAttribute"/>
/// and is never reachable anonymously. These endpoints accept IDs + quantities + design/notes only —
/// the backend resolves all prices (Epic 9200).
/// </summary>
[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = TeeNovaRoles.Admin)]
public class AdminOrderController : TeeNovaControllerBase
{
    private readonly IOrderAppService _orderAppService;

    public AdminOrderController(IOrderAppService orderAppService)
    {
        _orderAppService = orderAppService;
    }

    /// <summary>Admin-only, safe payment-attempt and reconciliation detail. Never exposed on the public order GET.</summary>
    [HttpGet("{id:guid}/online-payment-sessions")]
    public async Task<List<AdminOnlinePaymentSessionDto>> GetOnlinePaymentSessionsAsync(Guid id)
        => await _orderAppService.GetAdminOnlinePaymentSessionsAsync(id);

    /// <summary>Preview a content change: reprices the whole order and returns payment impact. No persistence.</summary>
    [HttpPost("{id:guid}/content/quote")]
    public async Task<OrderContentQuoteResultDto> QuoteContentUpdateAsync(
        Guid id, [FromBody] UpdateOrderContentDto input)
        => await _orderAppService.QuoteContentUpdateAsync(id, input);

    /// <summary>Validate, reprice and persist a content change; returns the fresh order (with PrintGroups).</summary>
    [HttpPut("{id:guid}/content")]
    public async Task<OrderDto> UpdateContentAsync(
        Guid id, [FromBody] UpdateOrderContentDto input)
        => await _orderAppService.UpdateContentAsync(id, input);
}
