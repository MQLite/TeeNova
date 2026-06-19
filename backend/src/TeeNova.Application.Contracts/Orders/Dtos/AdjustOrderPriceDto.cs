using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

public class AdjustOrderPriceDto
{
    [Required]
    [Range(0.01, double.MaxValue, ErrorMessage = "New total amount must be greater than zero.")]
    public decimal NewTotalAmount { get; set; }

    [Required]
    [MaxLength(1000)]
    public string Reason { get; set; } = default!;
}
