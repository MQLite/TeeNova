using System.Globalization;
using System.Text.Json;

namespace TeeNova.Reception;

public sealed record ReceptionSheetPdfSnapshot(
    Guid SheetId,
    string Customer,
    string Phone,
    string Received,
    string? PickupDate,
    string Instructions,
    ReceptionPrintLayout? Layout,
    decimal? TotalPrice,
    decimal? Deposit,
    string? PrintEstimate,
    ReceptionPayment[]? Payments = null)
{
    public const string TemplateVersion = "reception-a4-v2";
    private static readonly TimeZoneInfo Auckland = TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");

    public static ReceptionSheetPdfSnapshot FromSheet(ReceptionSheet sheet)
    {
        try
        {
            var layout = sheet.ReadPrintLayout() is { } json
                ? JsonSerializer.Deserialize<ReceptionPrintLayout>(json)
                : null;
            if (layout is not null && !layout.IsValid())
                throw new ReceptionSheetPdfGenerationException("The saved worksheet layout is invalid.");
            var received = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(sheet.CreationTime, DateTimeKind.Utc), Auckland)
                .ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            return new ReceptionSheetPdfSnapshot(sheet.Id, sheet.Customer, sheet.Phone, received,
                sheet.PickupDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                sheet.Instructions, layout, sheet.TotalPrice, sheet.Deposit, sheet.PrintEstimate, sheet.ReadPayments());
        }
        catch (JsonException)
        {
            throw new ReceptionSheetPdfGenerationException("The saved worksheet layout could not be read.");
        }
    }
}

public interface IReceptionSheetPdfGenerator
{
    Task<GeneratedReceptionSheetPdf> GenerateAsync(ReceptionSheetPdfSnapshot snapshot, CancellationToken cancellationToken);
}

public sealed record GeneratedReceptionSheetPdf(byte[] Bytes, int PageCount);

public sealed class ReceptionSheetPdfGenerationException(string message) : Exception(message);
