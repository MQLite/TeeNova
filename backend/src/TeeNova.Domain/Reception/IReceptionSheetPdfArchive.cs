namespace TeeNova.Reception;

public sealed record ReceptionSheetPdfInfo(Guid Id, string Version, int Pages, DateTimeOffset CreatedAt, bool IsCurrent);

public abstract record ReceptionSheetPdfReservation
{
    public sealed record MissingSheet : ReceptionSheetPdfReservation;
    public sealed record StaleVersion : ReceptionSheetPdfReservation;
    public sealed record FailedAttempt : ReceptionSheetPdfReservation;
    public sealed record Pending(Guid Attempt) : ReceptionSheetPdfReservation;
    public sealed record Generate(Guid PdfId, Guid Attempt, string SnapshotJson) : ReceptionSheetPdfReservation;
    public sealed record Archived(ReceptionSheetPdfInfo Info) : ReceptionSheetPdfReservation;
}

public interface IReceptionSheetPdfArchive
{
    Task<ReceptionSheetPdfReservation> ReserveAsync(Guid sheetId, string version, string template, Guid? observedAttempt,
        Func<ReceptionSheet, string> freeze, TimeSpan lease, CancellationToken ct);

    Task<ReceptionSheetPdfInfo?> CompleteAsync(Guid sheetId, string version, Guid id, Guid attempt, int pages,
        byte[] content, DateTimeOffset createdAt, CancellationToken ct);

    Task ReleaseAsync(Guid id, Guid attempt, CancellationToken ct);

    Task<IReadOnlyList<ReceptionSheetPdfInfo>?> ListAsync(Guid sheetId, string currentTemplate, CancellationToken ct);

    Task<byte[]?> ReadAsync(Guid sheetId, Guid id, CancellationToken ct);

    // Called inside the sheet deletion transaction after its Deleted stage has been persisted.
    Task PurgeAsync(Guid sheetId, CancellationToken ct);
}
