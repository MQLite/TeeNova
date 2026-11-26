using Volo.Abp.Domain.Entities;

namespace TeeNova.Reception;

public sealed class ReceptionSheetPdf : Entity<Guid>
{
    public Guid SheetId { get; private set; }
    public string Version { get; private set; } = null!;
    public string Template { get; private set; } = null!;
    public string? SnapshotJson { get; private set; }
    public Guid Attempt { get; private set; }
    public DateTime? LeaseUntilUtc { get; private set; }
    public DateTime? CreatedAtUtc { get; private set; }
    public int? Pages { get; private set; }
    public byte[]? Content { get; private set; }

    private ReceptionSheetPdf() { }

    public ReceptionSheetPdf(Guid id, Guid sheetId, string version, string template, string snapshotJson,
        Guid attempt, DateTime leaseUntilUtc) : base(id)
    {
        SheetId = sheetId;
        Version = version;
        Template = template;
        SnapshotJson = snapshotJson;
        Attempt = attempt;
        LeaseUntilUtc = leaseUntilUtc;
    }
}
