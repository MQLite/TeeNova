using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Volo.Abp.Data;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Reception;

public enum ReceptionStage { Preparing, Ready, Collected, Deleted }

public sealed record ReceptionPhotoSource(Guid ImportId, Guid DocumentId);
public sealed record ReceptionTextSource(Guid ImportId, Guid DocumentId);

public class ReceptionSheet : AuditedAggregateRoot<Guid>
{
    public const int MaxInstructions = 24000;
    public const int MaxPrintEstimateLength = 10000;
    [MaxLength(160)] public string Customer { get; private set; } = "";
    [MaxLength(80)] public string Phone { get; private set; } = "";
    public DateOnly? PickupDate { get; private set; }
    public string Instructions { get; private set; } = "";
    public ReceptionStage Stage { get; private set; }
    public decimal? TotalPrice { get; private set; }
    public decimal? Deposit { get; private set; }
    public string? PrintEstimate { get; private set; }
    public string? HandwritingJson { get; private set; }

    public static bool ValidAmount(decimal? value) => value is null ||
        (value is >= 0 and <= 99999999.99m && decimal.Round(value.Value, 2) == value);

    protected ReceptionSheet() { }

    public string? ReadPrintLayout() => this.GetProperty<string>("PrintLayoutV1");

    public ReceptionMaterials? ReadMaterials() =>
        this.GetProperty<string>("ReceptionMaterials") is { } json ? JsonSerializer.Deserialize<ReceptionMaterials>(json) : null;

    public void SetMaterials(ReceptionMaterials? materials)
    {
        if (materials is null) ExtraProperties.Remove("ReceptionMaterials");
        else this.SetProperty("ReceptionMaterials", JsonSerializer.Serialize(materials));
    }

    public ReceptionPhotoSource? ReadSourcePhoto() =>
        this.GetProperty<string>("SourcePhoto") is { } json ? JsonSerializer.Deserialize<ReceptionPhotoSource>(json) : null;

    public void SetSourcePhoto(ReceptionPhotoSource? photo)
    {
        if (photo == null) ExtraProperties.Remove("SourcePhoto");
        else this.SetProperty("SourcePhoto", JsonSerializer.Serialize(photo));
    }

    public ReceptionTextSource? ReadSourceText() =>
        this.GetProperty<string>("SourceText") is { } json ? JsonSerializer.Deserialize<ReceptionTextSource>(json) : null;

    public void SetSourceText(ReceptionTextSource? text)
    {
        if (text == null) ExtraProperties.Remove("SourceText");
        else this.SetProperty("SourceText", JsonSerializer.Serialize(text));
    }

    public ReceptionSheet(Guid id, string customer, string phone, DateOnly? pickupDate, string instructions,
        string? printLayoutJson = null)
        : base(id)
    {
        Revise(customer, phone, pickupDate, instructions, printLayoutJson, null, null, null);
    }

    public void Revise(string customer, string phone, DateOnly? pickupDate, string instructions,
        string? printLayoutJson, decimal? totalPrice, decimal? deposit, string? handwritingJson, string? printEstimate = null)
    {
        if (!ValidAmount(totalPrice) || !ValidAmount(deposit)) throw new ArgumentOutOfRangeException(nameof(totalPrice));
        if (printEstimate?.Length > MaxPrintEstimateLength) throw new ArgumentOutOfRangeException(nameof(printEstimate));
        Customer = customer.Trim();
        Phone = phone.Trim();
        PickupDate = pickupDate;
        Instructions = instructions.Trim();
        if (printLayoutJson == null) ExtraProperties.Remove("PrintLayoutV1");
        else this.SetProperty("PrintLayoutV1", printLayoutJson);
        TotalPrice = totalPrice;
        Deposit = deposit;
        PrintEstimate = string.IsNullOrWhiteSpace(printEstimate) ? null : printEstimate.Trim();
        HandwritingJson = handwritingJson;
    }

    public void MarkDeleted() => Stage = ReceptionStage.Deleted;

    public bool TryAdvance(ReceptionStage next, bool manualAdjustment = false)
    {
        if (Stage == ReceptionStage.Deleted || next is not (ReceptionStage.Preparing or ReceptionStage.Ready or ReceptionStage.Collected))
            return false;
        if (Stage == next) return true;
        if (!manualAdjustment && (Stage, next) is not ((ReceptionStage.Preparing, ReceptionStage.Ready)
            or (ReceptionStage.Ready, ReceptionStage.Collected))) return false;
        Stage = next;
        return true;
    }
}
