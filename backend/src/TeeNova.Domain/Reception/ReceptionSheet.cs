using System.ComponentModel.DataAnnotations;
using Volo.Abp.Data;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Reception;

public enum ReceptionStage { Preparing, Ready, Collected }

public class ReceptionSheet : AuditedAggregateRoot<Guid>
{
    public const int MaxInstructions = 24000;
    [MaxLength(160)] public string Customer { get; private set; } = "";
    [MaxLength(80)] public string Phone { get; private set; } = "";
    public DateOnly? PickupDate { get; private set; }
    public string Instructions { get; private set; } = "";
    public ReceptionStage Stage { get; private set; }
    public decimal? TotalPrice { get; private set; }
    public decimal? Deposit { get; private set; }
    public string? HandwritingJson { get; private set; }

    public static bool ValidAmount(decimal? value) => value is null ||
        (value is >= 0 and <= 99999999.99m && decimal.Round(value.Value, 2) == value);

    protected ReceptionSheet() { }

    public string? ReadPrintLayout() => this.GetProperty<string>("PrintLayoutV1");

    public ReceptionSheet(Guid id, string customer, string phone, DateOnly? pickupDate, string instructions,
        string? printLayoutJson = null)
        : base(id)
    {
        Revise(customer, phone, pickupDate, instructions, printLayoutJson, null, null, null);
    }

    public void Revise(string customer, string phone, DateOnly? pickupDate, string instructions,
        string? printLayoutJson, decimal? totalPrice, decimal? deposit, string? handwritingJson)
    {
        if (!ValidAmount(totalPrice) || !ValidAmount(deposit)) throw new ArgumentOutOfRangeException(nameof(totalPrice));
        Customer = customer.Trim();
        Phone = phone.Trim();
        PickupDate = pickupDate;
        Instructions = instructions.Trim();
        if (printLayoutJson == null) ExtraProperties.Remove("PrintLayoutV1");
        else this.SetProperty("PrintLayoutV1", printLayoutJson);
        TotalPrice = totalPrice;
        Deposit = deposit;
        HandwritingJson = handwritingJson;
    }

    public bool TryAdvance(ReceptionStage next)
    {
        if (Stage == next) return true;
        if ((Stage, next) is not ((ReceptionStage.Preparing, ReceptionStage.Ready)
            or (ReceptionStage.Ready, ReceptionStage.Collected))) return false;
        Stage = next;
        return true;
    }
}
