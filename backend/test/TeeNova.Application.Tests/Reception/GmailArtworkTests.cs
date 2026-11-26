using Microsoft.Data.Sqlite;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using TeeNova.Reception;

namespace TeeNova.Tests.Reception;

public sealed class GmailArtworkTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "teenova-artwork-" + Guid.NewGuid());
    private const string Mail = "desk@example.test";
    private static readonly GmailFile Pdf = new(0, "left.pdf", "application/pdf", "%PDF-test"u8.ToArray());

    [Fact]
    public void Retry_preserves_original_and_conflict_rolls_back_entire_batch()
    {
        var store = new GmailArtworkStore(root);
        var first = Guid.NewGuid();
        var different = Guid.NewGuid();
        Assert.Equal(1, store.Save(first, Mail, "abcdef", [Pdf]).Added);
        Assert.Equal(0, store.Save(first, Mail, "abcdef", [Pdf]).Added);
        var result = store.Save(different, Mail, "abcdef", [Pdf with { Slot = 1 }, Pdf]);
        Assert.True(result.Conflict);
        Assert.Equal(first, result.SheetId);
        Assert.Empty(store.List(different));
        var id = Guid.Parse(Assert.Single(new GmailArtworkStore(root).List(first)).Id);
        Assert.Equal(Pdf.Bytes, store.Read(first, id)!.Value.Bytes);
        Assert.Null(store.Read(different, id));
    }

    [Fact]
    public void Pending_files_can_be_split_across_sheets_and_new_order_reservations_survive_retries()
    {
        var store = new GmailArtworkStore(root);
        var files = new[] { Pdf, Pdf with { Slot = 1, Name = "back.pdf" } };
        var origin = new GmailOrigin(Mail, "Two designs", DateTimeOffset.UtcNow);
        Assert.Equal(2, store.Save(Guid.Empty, Mail, "ab", files, origin).Added);
        Assert.Equal(0, store.Save(Guid.Empty, Mail, "ab", files, origin).Added);
        var queue = store.Pending();
        var first = queue.Single(x => x.Name == "left.pdf").Id;
        var second = queue.Single(x => x.Name == "back.pdf").Id;
        var colleagueSheet = Guid.NewGuid();
        Assert.Equal("First customer", store.ReserveNew(first, "First customer"));
        Assert.Equal("First customer", store.ReserveNew(first, "Retry name"));
        Assert.False(store.Assign(first, colleagueSheet, false));
        Assert.True(store.Assign(first, first, true));
        Assert.True(store.Assign(first, first, true));
        Assert.True(store.Assign(second, colleagueSheet, false));
        Assert.False(store.Assign(second, Guid.NewGuid(), false));
        Assert.Null(store.ReserveNew(second, "Late"));
        Assert.Empty(store.Pending());
        Assert.Equal(Pdf.Bytes, store.Read(first, first)!.Value.Bytes);
        Assert.Equal(Pdf.Bytes, store.Read(colleagueSheet, second)!.Value.Bytes);
        Assert.True(store.Save(Guid.Empty, Mail, "ab", files, origin).Conflict);
    }

    [Fact]
    public async Task Queue_thumbnail_is_bounded_and_transparent_and_keeps_the_original_private_to_its_sheet()
    {
        var sheet = Guid.NewGuid();
        var store = new GmailArtworkStore(root);
        using var original = new Image<Rgba32>(960, 480, new Rgba32(21, 34, 56, 85));
        using var data = new MemoryStream();
        original.SaveAsPng(data);
        store.Save(sheet, Mail, "ab", [new GmailFile(0, "logo.png", "image/png", data.ToArray())]);
        var file = Guid.Parse(Assert.Single(store.List(sheet)).Id);
        var bytes = await GmailArtworkPreview.Get(store, sheet, file, 320, "", default);
        Assert.NotNull(bytes);
        using var image = Image.Load<Rgba32>(bytes);
        Assert.Equal(new Size(320, 160), image.Size);
        Assert.Equal(85, image[50, 50].A);
        Assert.Equal(bytes, store.CachedPreview(sheet, file, 320));
        Assert.Null(await GmailArtworkPreview.Get(store, Guid.NewGuid(), file, 320, "", default));
        Assert.Equal(data.ToArray(), store.Read(sheet, file)!.Value.Bytes);
    }

    [Fact]
    public async Task Simultaneous_submissions_create_one_file()
    {
        var sheet = Guid.NewGuid();
        var writes = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => Task.Run(() =>
            new GmailArtworkStore(root).Save(sheet, Mail, "ab12", [Pdf]))));
        Assert.Equal(1, writes.Sum(r => r.Added));
        Assert.Single(new GmailArtworkStore(root).List(sheet));
    }

    [Fact]
    public async Task Cached_preview_follows_the_artwork_when_linked_and_remains_private_to_its_sheet()
    {
        var store = new GmailArtworkStore(root);
        store.Save(Guid.Empty, Mail, "def", [Pdf],
            new(Mail, "Test", DateTimeOffset.UtcNow));
        var pending = Assert.Single(store.Pending());
        byte[] thumbnail = [1, 2, 3];
        store.CachePreview(pending.Id, 320, thumbnail);
        var sheet = Guid.NewGuid();
        Assert.True(store.Assign(pending.Id, sheet, false));
        Assert.Null(await GmailArtworkPreview.Get(store, Guid.Empty, pending.Id, 320, "", default));
        Assert.Equal(thumbnail, await GmailArtworkPreview.Get(store, sheet, pending.Id, 320, "", default));
        var visible = store.ListForSheets([sheet, Guid.Empty]);
        Assert.Equal("left.pdf", Assert.Single(visible[sheet]).Name);
        Assert.Empty(visible[Guid.Empty]);
    }

    [Fact]
    public void Notice_tracks_only_pending_files_and_repeat_saves_do_not_announce_new_arrivals()
    {
        var store = new GmailArtworkStore(root);
        var origin = new GmailOrigin(Mail, "draft", DateTimeOffset.UtcNow);
        Assert.Equal((0L, 0L), store.PendingNotice());
        store.Save(Guid.Empty, Mail, "ab", [Pdf], origin);
        var initial = store.PendingNotice();
        store.Save(Guid.Empty, Mail, "ab", [Pdf], origin);
        Assert.Equal(initial, store.PendingNotice());
        Assert.True(store.Assign(Assert.Single(store.Pending()).Id, Guid.NewGuid(), false));
        Assert.Equal((0L, 0L), store.PendingNotice());
        store.Save(Guid.Empty, Mail, "ac", [Pdf], origin);
        Assert.Equal(1L, store.PendingNotice().Count);
        Assert.True(store.PendingNotice().Latest > initial.Latest);
    }

    [Fact]
    public void Returning_a_deleted_sheet_releases_every_file_once_and_preserves_the_original_and_preview()
    {
        var store = new GmailArtworkStore(root);
        store.Save(Guid.Empty, Mail, "aa", [Pdf], new(Mail, "Original subject", DateTimeOffset.UtcNow));
        var old = store.Pending().Single().Id;
        var arrival = store.PendingNotice().Latest;
        store.CachePreview(old, 320, [1, 2]);
        store.ReserveNew(old, "Old customer");
        Assert.True(store.Assign(old, old, true));
        store.Save(old, Mail, "bb", [Pdf with {Name = "direct.pdf"}]);
        store.ReturnFromDeletedSheet(old);
        store.ReturnFromDeletedSheet(old);
        Assert.Empty(store.List(old));
        Assert.Equal(2, store.Pending().Count);
        Assert.True(store.PendingNotice().Latest > arrival);
        var returned = store.Pending().Single(x => x.Subject == "Original subject");
        Assert.NotEqual(old, returned.Id);
        Assert.Null(returned.NewCustomer);
        Assert.Equal(Pdf.Bytes, store.Read(Guid.Empty, returned.Id)!.Value.Bytes);
        Assert.Equal(new byte[] {1, 2}, store.CachedPreview(Guid.Empty, returned.Id, 320));
        Assert.False(store.Assign(returned.Id, old, false));
        Assert.True(store.Save(old, Mail, "cc", [Pdf]).Conflict);
        Assert.Equal("New customer", store.ReserveNew(returned.Id, "New customer"));
        Assert.True(store.Assign(returned.Id, returned.Id, true));
        Assert.False(store.Remove(Guid.Empty, returned.Id));
        Assert.True(store.Remove(returned.Id, returned.Id));
        store.ReturnFromDeletedSheet(returned.Id);
        var direct = Assert.Single(store.Pending());
        Assert.Equal("direct.pdf", direct.Name);
        Assert.True(store.Remove(Guid.Empty, direct.Id));
        Assert.Empty(store.Pending());
        Assert.Null(store.Read(Guid.Empty, direct.Id));
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(root)) Directory.Delete(root, true);
    }
}

