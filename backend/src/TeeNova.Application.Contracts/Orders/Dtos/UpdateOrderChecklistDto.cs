namespace TeeNova.Orders.Dtos;

public class UpdateOrderChecklistDto
{
    public bool IsDesignReviewed { get; set; }
    public bool IsFileDownloaded { get; set; }
    public bool IsGarmentConfirmed { get; set; }
    public bool IsReadyToPrint { get; set; }
}
