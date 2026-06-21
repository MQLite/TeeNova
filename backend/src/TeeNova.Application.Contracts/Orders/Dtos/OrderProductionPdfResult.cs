namespace TeeNova.Orders.Dtos;

/// <summary>
/// Result of generating an order production-sheet PDF on demand.
/// Carries the raw PDF bytes plus the suggested download filename and content type.
/// Nothing is persisted — the bytes live only for the duration of the request.
/// </summary>
public class OrderProductionPdfResult
{
    public byte[] Content { get; set; } = default!;
    public string FileName { get; set; } = default!;
    public string ContentType { get; set; } = "application/pdf";
}
