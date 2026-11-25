using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;

namespace TeeNova.Reception;

internal sealed record GmailFile(int Slot, string Name, string Mime, byte[] Bytes);
internal sealed record GmailFileInfo(string Id, string Name, string Mime);
internal sealed record GmailSaveResult(bool Conflict, Guid SheetId, int Added);
internal sealed record GmailOrigin(string Sender, string Subject, DateTimeOffset Received);
internal sealed record PendingArtwork(Guid Id, string Name, string Sender, string Subject, string Received, string? NewCustomer, string Mime);

// One private database per installation. A batch is committed together and one email
// attachment can belong to at most one sheet, including during concurrent retries.
internal sealed class GmailArtworkStore(string root)
{
    internal static GmailArtworkStore? Configured(IConfiguration config, IHostEnvironment host, IOptions<PrivateObjectStorageOptions> options) =>
        string.IsNullOrWhiteSpace(config["GmailReception:PrivateDirectory"]) ? null : new(
            LocalPrivateObjectStorage.PreparePrivateDirectory(host.ContentRootPath, config["GmailReception:PrivateDirectory"]!, options.Value.ForbiddenPathPrefixes));

    private SqliteConnection Open()
    {
        if (!Path.IsPathFullyQualified(root)) throw new InvalidOperationException("A private Gmail storage directory is required.");
        Directory.CreateDirectory(root);
        var database = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = Path.Combine(root, "gmail-artwork.sqlite")
        }.ToString());
        database.Open();
        try
        {
            using var schema = database.CreateCommand();
            schema.CommandText = """
                CREATE TABLE IF NOT EXISTS Artwork(
                    Id TEXT PRIMARY KEY, Sheet TEXT NOT NULL, Mailbox TEXT NOT NULL,
                    Message TEXT NOT NULL, Slot INTEGER NOT NULL, Name TEXT NOT NULL,
                    Mime TEXT NOT NULL, Content BLOB NOT NULL, UNIQUE(Mailbox, Message, Slot));
                CREATE INDEX IF NOT EXISTS ArtworkSheet ON Artwork(Sheet);
                CREATE TABLE IF NOT EXISTS RetiredSheet(Id TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS ArtworkPreview(
                    FileId TEXT NOT NULL, Width INTEGER NOT NULL, Png BLOB NOT NULL, PRIMARY KEY(FileId,Width));
                CREATE TABLE IF NOT EXISTS PendingMail(
                    ArtworkId TEXT PRIMARY KEY, Sender TEXT NOT NULL, Subject TEXT NOT NULL,
                    Received TEXT NOT NULL, NewCustomer TEXT);
                """;
            schema.ExecuteNonQuery();
            return database;
        }
        catch { database.Dispose(); throw; }
    }

    public GmailSaveResult Save(Guid sheet, string mailbox, string message, IReadOnlyList<GmailFile> files, GmailOrigin? origin = null)
    {
        if ((sheet == Guid.Empty) != (origin != null)) throw new ArgumentException("Pending artwork requires email details.");
        using var db = Open();
        using var tx = db.BeginTransaction(deferred: false);
        using var retired = db.CreateCommand();
        retired.Transaction = tx;
        retired.CommandText = "SELECT 1 FROM RetiredSheet WHERE Id=$sheet";
        retired.Parameters.AddWithValue("$sheet", sheet.ToString());
        if (retired.ExecuteScalar() != null) return new(true, sheet, 0);
        var added = 0;
        foreach (var file in files)
        {
            using var command = db.CreateCommand();
            command.Transaction = tx;
            command.Parameters.AddWithValue("$mailbox", mailbox);
            command.Parameters.AddWithValue("$message", message);
            command.Parameters.AddWithValue("$slot", file.Slot);
            command.CommandText = "SELECT Sheet FROM Artwork WHERE Mailbox=$mailbox AND Message=$message AND Slot=$slot";
            if (command.ExecuteScalar() is string owner)
            {
                var linked = Guid.Parse(owner);
                if (sheet != linked) return new(true, linked, 0);
                continue;
            }
            command.CommandText = "INSERT INTO Artwork(Id,Sheet,Mailbox,Message,Slot,Name,Mime,Content) VALUES($id,$sheet,$mailbox,$message,$slot,$name,$mime,$content)";
            var id = Guid.NewGuid().ToString();
            command.Parameters.AddWithValue("$id", id);
            command.Parameters.AddWithValue("$sheet", sheet.ToString());
            command.Parameters.AddWithValue("$name", file.Name);
            command.Parameters.AddWithValue("$mime", file.Mime);
            command.Parameters.AddWithValue("$content", file.Bytes);
            command.ExecuteNonQuery();
            if (origin != null)
            {
                command.CommandText = "INSERT INTO PendingMail(ArtworkId,Sender,Subject,Received) VALUES($id,$sender,$subject,$received)";
                command.Parameters.AddWithValue("$sender", origin.Sender);
                command.Parameters.AddWithValue("$subject", origin.Subject);
                command.Parameters.AddWithValue("$received", origin.Received.UtcDateTime.ToString("O"));
                command.ExecuteNonQuery();
            }
            added++;
        }
        tx.Commit();
        return new(false, sheet, added);
    }

    public (long Count, long Latest) PendingNotice()
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT count(*), coalesce(max(rowid),0) FROM Artwork WHERE Sheet=$pending";
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        using var rows = cmd.ExecuteReader();
        rows.Read();
        return (rows.GetInt64(0), rows.GetInt64(1));
    }

    public List<PendingArtwork> Pending()
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = """
            SELECT Id,Name,Sender,Subject,Received,NewCustomer,Mime FROM Artwork
            JOIN PendingMail ON ArtworkId=Id WHERE Sheet=$pending ORDER BY Received DESC,Id
            """;
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        using var rows = cmd.ExecuteReader();
        var result = new List<PendingArtwork>();
        while (rows.Read()) result.Add(new(Guid.Parse(rows.GetString(0)), rows.GetString(1),
            rows.GetString(2), rows.GetString(3), rows.GetString(4), rows.IsDBNull(5) ? null : rows.GetString(5), rows.GetString(6)));
        return result;
    }

    // Persist the first confirmed name before creating a sheet in the main database.
    // A retry uses the same sheet ID and name after a lost response or interrupted save.
    public string? ReserveNew(Guid file, string customer)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = """
            UPDATE PendingMail SET NewCustomer=COALESCE(NewCustomer,$customer)
            WHERE ArtworkId=$file AND EXISTS(SELECT 1 FROM Artwork WHERE Id=$file AND Sheet IN ($pending,$file))
            RETURNING NewCustomer
            """;
        cmd.Parameters.AddWithValue("$file", file.ToString());
        cmd.Parameters.AddWithValue("$customer", customer);
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        return cmd.ExecuteScalar() as string;
    }

    public bool Assign(Guid file, Guid sheet, bool creating)
    {
        if (sheet == Guid.Empty || (creating && file != sheet)) return false;
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = """
            UPDATE Artwork SET Sheet=$sheet WHERE Id=$file AND Sheet IN ($pending,$sheet)
            AND NOT EXISTS(SELECT 1 FROM RetiredSheet WHERE Id=$sheet)
            AND EXISTS(SELECT 1 FROM PendingMail WHERE ArtworkId=$file AND (NewCustomer IS NULL OR $creating=1))
            """;
        cmd.Parameters.AddWithValue("$file", file.ToString());
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        cmd.Parameters.AddWithValue("$sheet", sheet.ToString());
        cmd.Parameters.AddWithValue("$creating", creating ? 1 : 0);
        return cmd.ExecuteNonQuery() == 1;
    }

    public List<GmailFileInfo> List(Guid sheet)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Id,Name,Mime FROM Artwork WHERE Sheet=$sheet ORDER BY rowid";
        cmd.Parameters.AddWithValue("$sheet", sheet.ToString());
        using var rows = cmd.ExecuteReader();
        var files = new List<GmailFileInfo>();
        while (rows.Read()) files.Add(new(rows.GetString(0), rows.GetString(1), rows.GetString(2)));
        return files;
    }

    // Candidates for recovery if the process stopped after the main database committed a deletion.
    public List<Guid> LinkedSheets()
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = """
            SELECT DISTINCT Sheet FROM Artwork WHERE Sheet NOT IN ($pending,'removed')
            UNION SELECT Id FROM Artwork JOIN PendingMail ON ArtworkId=Id WHERE Sheet=$pending AND NewCustomer IS NOT NULL
            """;
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        using var rows = cmd.ExecuteReader();
        var ids = new List<Guid>();
        while (rows.Read()) ids.Add(Guid.Parse(rows.GetString(0)));
        return ids;
    }

    public void ReturnFromDeletedSheet(Guid sheet)
    {
        if (sheet == Guid.Empty) throw new ArgumentException("A work order ID is required.", nameof(sheet));
        using var db = Open();
        using var tx = db.BeginTransaction(deferred: false);
        using var cmd = db.CreateCommand();
        cmd.Transaction = tx;
        cmd.Parameters.AddWithValue("$sheet", sheet.ToString());
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        cmd.CommandText = "INSERT OR IGNORE INTO RetiredSheet(Id) VALUES($sheet)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = """
            SELECT Id FROM Artwork WHERE Sheet=$sheet OR
                (Sheet=$pending AND Id=$sheet AND EXISTS(SELECT 1 FROM PendingMail WHERE ArtworkId=Id AND NewCustomer IS NOT NULL))
            """;
        var files = new List<string>();
        using (var rows = cmd.ExecuteReader()) while (rows.Read()) files.Add(rows.GetString(0));
        cmd.Parameters.AddWithValue("$subject", $"从已删除工单 #{sheet.ToString()[..8]} 退回");
        cmd.Parameters.AddWithValue("$now", DateTime.UtcNow.ToString("O"));
        var old = cmd.Parameters.Add("$old", SqliteType.Text);
        var next = cmd.Parameters.Add("$next", SqliteType.Text);
        // A fresh intake ID invalidates stale actions and allows opening another new order
        // even when the previous order was originally created from this same attachment.
        cmd.CommandText = """
            INSERT OR IGNORE INTO PendingMail(ArtworkId,Sender,Subject,Received) VALUES($old,'',$subject,$now);
            UPDATE PendingMail SET ArtworkId=$next,NewCustomer=NULL WHERE ArtworkId=$old;
            UPDATE ArtworkPreview SET FileId=$next WHERE FileId=$old;
            UPDATE Artwork SET rowid=(SELECT max(rowid)+1 FROM Artwork), Id=$next,Sheet=$pending WHERE Id=$old;
            """;
        foreach (var file in files)
        {
            old.Value = file;
            next.Value = Guid.NewGuid().ToString();
            cmd.ExecuteNonQuery();
        }
        tx.Commit();
    }

    public bool Remove(Guid sheet, Guid file)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        // Keep a private recovery copy and free the Gmail slot for an intentional re-import.
        cmd.CommandText = """
            UPDATE Artwork SET Sheet='removed',Mailbox=Mailbox || '/' || Id WHERE Id=$file AND Sheet=$sheet
            AND (Sheet<>$pending OR NOT EXISTS(SELECT 1 FROM PendingMail WHERE ArtworkId=Id AND NewCustomer IS NOT NULL))
            """;
        cmd.Parameters.AddWithValue("$file", file.ToString());
        cmd.Parameters.AddWithValue("$sheet", sheet.ToString());
        cmd.Parameters.AddWithValue("$pending", Guid.Empty.ToString());
        return cmd.ExecuteNonQuery() == 1;
    }

    public ILookup<Guid, GmailFileInfo> ListForSheets(IEnumerable<Guid> ids)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        var keys = ids.Distinct().Where(id => id != Guid.Empty).Select((id, index) =>
            cmd.Parameters.AddWithValue("$s" + index, id.ToString()).ParameterName).ToArray();
        var files = new List<(Guid Sheet, GmailFileInfo File)>();
        if (keys.Length > 0)
        {
            cmd.CommandText = $"SELECT Sheet,Id,Name,Mime FROM Artwork WHERE Sheet IN ({string.Join(",", keys)}) ORDER BY rowid";
            using var rows = cmd.ExecuteReader();
            while (rows.Read()) files.Add((Guid.Parse(rows.GetString(0)), new(rows.GetString(1), rows.GetString(2), rows.GetString(3))));
        }
        return files.ToLookup(x => x.Sheet, x => x.File);
    }

    public byte[]? CachedPreview(Guid sheet, Guid file, int width)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Png FROM ArtworkPreview JOIN Artwork ON Id=FileId WHERE Sheet=$sheet AND Id=$file AND Width=$width";
        cmd.Parameters.AddWithValue("$sheet", sheet.ToString());
        cmd.Parameters.AddWithValue("$file", file.ToString());
        cmd.Parameters.AddWithValue("$width", width);
        return cmd.ExecuteScalar() as byte[];
    }

    public void CachePreview(Guid file, int width, byte[] png)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = "INSERT OR IGNORE INTO ArtworkPreview(FileId,Width,Png) SELECT Id,$width,$png FROM Artwork WHERE Id=$file AND Sheet<>'removed'";
        cmd.Parameters.AddWithValue("$file", file.ToString());
        cmd.Parameters.AddWithValue("$width", width);
        cmd.Parameters.AddWithValue("$png", png);
        cmd.ExecuteNonQuery();
    }

    public (byte[] Bytes, string Mime)? Read(Guid sheet, Guid id)
    {
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Content,Mime FROM Artwork WHERE Sheet=$sheet AND Id=$id";
        cmd.Parameters.AddWithValue("$sheet", sheet.ToString());
        cmd.Parameters.AddWithValue("$id", id.ToString());
        using var row = cmd.ExecuteReader();
        return row.Read() ? ((byte[])row[0], row.GetString(1)) : null;
    }
}
