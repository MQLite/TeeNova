using System;
using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

public class CreateOrderItemPrintDto
{
    [Required]
    public Guid PrintAreaId { get; set; }

    [Required]
    public Guid PrintSizeId { get; set; }
}
