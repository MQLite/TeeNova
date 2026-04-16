using System.ComponentModel.DataAnnotations;

namespace TeeNova.Orders.Dtos;

public class UpdateAdminNotesDto
{
    [MaxLength(4000)]
    public string? AdminNotes { get; set; }
}
