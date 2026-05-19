using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

public class RecordPaymentDto
{
    [Required]
    [Range(0.01, double.MaxValue, ErrorMessage = "Amount must be greater than zero.")]
    public decimal Amount { get; set; }

    [Required]
    public ManualPaymentMethod Method { get; set; }

    [MaxLength(256)]
    public string? Reference { get; set; }

    [MaxLength(1000)]
    public string? Note { get; set; }
}
