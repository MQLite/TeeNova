using Microsoft.EntityFrameworkCore;
using TeeNova.Reception;
using Volo.Abp.DependencyInjection;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.Uow;

namespace TeeNova.EntityFrameworkCore.Reception;

[ExposeServices(typeof(IReceptionSheetPdfArchive))]
internal sealed class EfReceptionSheetPdfArchive(
    IDbContextProvider<TeeNovaDbContext> dbContexts, IUnitOfWorkManager work, TimeProvider clock)
    : IReceptionSheetPdfArchive, ITransientDependency
{
    public async Task<ReceptionSheetPdfReservation> ReserveAsync(Guid sheetId, string version, string template,
        Guid? observedAttempt, Func<ReceptionSheet, string> freeze, TimeSpan lease, CancellationToken ct)
    {
        using var tx = work.Begin(requiresNew: true, isTransactional: true);
        var db = await dbContexts.GetDbContextAsync();
        var sheet = await LockSheetAsync(db, sheetId, ct);
        if (sheet is null) return new ReceptionSheetPdfReservation.MissingSheet();

        var archive = db.Set<ReceptionSheetPdf>();
        var entry = await archive.Where(x => x.SheetId == sheetId && x.Version == version && x.Template == template)
            .Select(x => new { x.Id, x.Version, x.SnapshotJson, x.Attempt, x.LeaseUntilUtc, x.CreatedAtUtc, x.Pages })
            .SingleOrDefaultAsync(ct);
        if (entry is not null && entry.Version != version) return new ReceptionSheetPdfReservation.StaleVersion();
        if (entry?.CreatedAtUtc is { } createdAt && entry.Pages is { } pages)
            return new ReceptionSheetPdfReservation.Archived(new(entry.Id, entry.Version, pages, AsUtc(createdAt),
                entry.Version == sheet.ConcurrencyStamp));

        var now = clock.GetUtcNow().UtcDateTime;
        if (entry?.LeaseUntilUtc > now)
            return new ReceptionSheetPdfReservation.Pending(entry.Attempt);
        if (entry is not null && entry.Attempt == observedAttempt && entry.LeaseUntilUtc is null)
            return new ReceptionSheetPdfReservation.FailedAttempt();
        if (entry is null && sheet.ConcurrencyStamp != version)
            return new ReceptionSheetPdfReservation.StaleVersion();

        var attempt = Guid.NewGuid();
        var id = entry?.Id ?? Guid.NewGuid();
        var snapshot = entry?.SnapshotJson ?? freeze(sheet);
        var leaseUntil = now.Add(lease);
        if (entry is null)
            archive.Add(new(id, sheetId, version, template, snapshot, attempt, leaseUntil));
        else
            await archive.Where(x => x.Id == id).ExecuteUpdateAsync(update => update
                .SetProperty(x => x.Attempt, attempt).SetProperty(x => x.LeaseUntilUtc, leaseUntil), ct);

        // Once the claim is written, commit it even if the HTTP caller disconnects.
        await tx.CompleteAsync(CancellationToken.None);
        return new ReceptionSheetPdfReservation.Generate(id, attempt, snapshot);
    }

    public async Task<ReceptionSheetPdfInfo?> CompleteAsync(Guid sheetId, string version, Guid id, Guid attempt,
        int pages, byte[] content, DateTimeOffset createdAt, CancellationToken ct)
    {
        using var tx = work.Begin(requiresNew: true, isTransactional: true);
        var db = await dbContexts.GetDbContextAsync();
        var sheet = await LockSheetAsync(db, sheetId, ct);
        if (sheet is null) return null;

        var updated = await db.Set<ReceptionSheetPdf>()
            .Where(x => x.SheetId == sheetId && x.Version == version && x.Id == id && x.Attempt == attempt && x.LeaseUntilUtc != null)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Pages, pages).SetProperty(x => x.Content, content)
                .SetProperty(x => x.CreatedAtUtc, createdAt.UtcDateTime).SetProperty(x => x.LeaseUntilUtc, (DateTime?)null)
                .SetProperty(x => x.SnapshotJson, (string?)null), ct);
        await tx.CompleteAsync(ct);
        return updated == 1 ? new(id, version, pages, createdAt, sheet.ConcurrencyStamp == version) : null;
    }

    public async Task ReleaseAsync(Guid id, Guid attempt, CancellationToken ct)
    {
        using var tx = work.Begin(requiresNew: true, isTransactional: true);
        var db = await dbContexts.GetDbContextAsync();
        await db.Set<ReceptionSheetPdf>().Where(x => x.Id == id && x.Attempt == attempt && x.CreatedAtUtc == null)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.LeaseUntilUtc, (DateTime?)null), ct);
        await tx.CompleteAsync(ct);
    }

    public async Task<IReadOnlyList<ReceptionSheetPdfInfo>?> ListAsync(Guid sheetId, CancellationToken ct)
    {
        using var unit = work.Begin(requiresNew: true, isTransactional: false);
        var db = await dbContexts.GetDbContextAsync();
        if (!await db.ReceptionSheets.AnyAsync(x => x.Id == sheetId, ct)) return null;

        var entries = await Available(db, sheetId).OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Select(x => new { x.Id, x.Version, x.Pages, x.CreatedAtUtc,
                IsCurrent = db.ReceptionSheets.Any(sheet => sheet.Id == x.SheetId && sheet.ConcurrencyStamp == x.Version) })
            .ToListAsync(ct);
        await unit.CompleteAsync(ct);
        return entries.Select(x => new ReceptionSheetPdfInfo(x.Id, x.Version, x.Pages!.Value,
            AsUtc(x.CreatedAtUtc!.Value), x.IsCurrent)).ToArray();
    }

    public async Task<byte[]?> ReadAsync(Guid sheetId, Guid id, CancellationToken ct)
    {
        using var unit = work.Begin(requiresNew: true, isTransactional: false);
        var db = await dbContexts.GetDbContextAsync();
        var content = await Available(db, sheetId).Where(x => x.Id == id).Select(x => x.Content).SingleOrDefaultAsync(ct);
        await unit.CompleteAsync(ct);
        return content;
    }

    public async Task PurgeAsync(Guid sheetId, CancellationToken ct)
    {
        var db = await dbContexts.GetDbContextAsync();
        await db.Set<ReceptionSheetPdf>().Where(x => x.SheetId == sheetId).ExecuteDeleteAsync(ct);
    }

    private static IQueryable<ReceptionSheetPdf> Available(TeeNovaDbContext db, Guid sheetId) => db.Set<ReceptionSheetPdf>()
        .Where(x => x.SheetId == sheetId && x.CreatedAtUtc != null && db.ReceptionSheets.Any(sheet => sheet.Id == sheetId));

    // Serialize reservations and publication with sheet writes and deletion. The lock is
    // released before rendering, so slow generation never blocks edits to the sheet.
    private static Task<ReceptionSheet?> LockSheetAsync(TeeNovaDbContext db, Guid sheetId, CancellationToken ct)
    {
        var sheets = db.Database.IsSqlServer()
            ? db.ReceptionSheets.FromSql($"SELECT * FROM [teenova].[ReceptionSheets] WITH (UPDLOCK) WHERE [Id] = {sheetId}")
            : db.ReceptionSheets;
        return sheets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == sheetId, ct);
    }

    private static DateTimeOffset AsUtc(DateTime value) => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}
