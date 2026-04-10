using System;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Orders.Dtos;

public class GetOrdersInput : PagedAndSortedResultRequestDto
{
    /// <summary>Matches order number, customer name, or customer email (case-insensitive contains).</summary>
    public string? Search { get; set; }

    public OrderStatus? Status { get; set; }

    public DateTime? DateFrom { get; set; }

    public DateTime? DateTo { get; set; }
}
