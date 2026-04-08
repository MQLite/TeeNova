using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

public class UpdateOrderStatusDto
{
    [Required]
    public OrderStatus NewStatus { get; set; }
    public string? Reason { get; set; }
}
