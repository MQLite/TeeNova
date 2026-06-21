using System;
using System.Threading.Tasks;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Generates an A4 production-sheet PDF for an order, on demand, in memory.
///
/// Intentionally NOT an <see cref="Volo.Abp.Application.Services.IApplicationService"/>:
/// the project exposes ABP conventional controllers for the Application assembly, so an
/// application service would be auto-published as an extra HTTP endpoint. The production
/// PDF must be reachable only through the explicit, authenticated
/// <c>GET /api/orders/{id}/production-pdf</c> action on the order controller.
/// </summary>
public interface IOrderProductionPdfService
{
    /// <summary>
    /// Loads the current order data and renders a production-sheet PDF.
    /// Does not mutate any state. Throws <see cref="Volo.Abp.Domain.Entities.EntityNotFoundException"/>
    /// when the order does not exist.
    /// </summary>
    Task<OrderProductionPdfResult> GenerateAsync(Guid orderId);
}
