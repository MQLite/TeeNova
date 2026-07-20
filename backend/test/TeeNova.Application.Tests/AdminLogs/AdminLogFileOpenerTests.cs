using System.Runtime.InteropServices;
using System.Net.Sockets;

namespace TeeNova.AdminLogs;

public sealed class AdminLogFileOpenerTests
{
    private readonly AdminLogFileOpener _opener = new();
    private readonly AdminLogFileMetadataReader _metadataReader = new();

    [Fact]
    public async Task Valid_regular_file_opens_by_stable_handle_with_exact_length()
    {
        using var directory = new TemporaryDirectory();
        var path = directory.CreateFile("valid.log", "hello");
        var claim = Claim(directory, path);

        await using var opened = _opener.Open(directory.Source("api"), claim, 5);

        Assert.Equal(5, opened.Length);
        var bytes = new byte[5];
        Assert.Equal(5, await opened.Stream.ReadAsync(bytes));
        Assert.Equal("hello", System.Text.Encoding.UTF8.GetString(bytes));
    }

    [Fact]
    public void Directory_is_rejected()
    {
        using var directory = new TemporaryDirectory();
        Directory.CreateDirectory(Path.Combine(directory.Path, "folder.log"));
        var claim = BasicClaim(directory, "folder.log", 0);

        AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () =>
            _opener.Open(directory.Source("api"), claim, 100));
    }

    [Fact]
    public void Deleted_or_renamed_file_is_unavailable()
    {
        using var directory = new TemporaryDirectory();
        var deleted = directory.CreateFile("deleted.log", "data");
        var deletedClaim = Claim(directory, deleted);
        File.Delete(deleted);
        AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () =>
            _opener.Open(directory.Source("api"), deletedClaim, 100));

        var renamed = directory.CreateFile("renamed.log", "data");
        var renamedClaim = Claim(directory, renamed);
        File.Move(renamed, Path.Combine(directory.Path, "moved.log"));
        AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () =>
            _opener.Open(directory.Source("api"), renamedClaim, 100));
    }

    [Fact]
    public void Replacement_under_same_basename_is_changed()
    {
        using var directory = new TemporaryDirectory();
        var path = directory.CreateFile("replace.log", "old");
        var claim = Claim(directory, path);
        var oldPath = Path.Combine(directory.Path, "old.log");
        File.Move(path, oldPath);
        directory.CreateFile("replace.log", "new");

        AssertFailure(AdminLogFileOpenFailure.FileChanged, () =>
            _opener.Open(directory.Source("api"), claim, 100));
    }

    [Fact]
    public void Truncation_before_open_is_changed_and_append_is_allowed()
    {
        using var directory = new TemporaryDirectory();
        var truncatedPath = directory.CreateFile("truncated.log", "12345");
        var truncatedClaim = Claim(directory, truncatedPath);
        File.WriteAllText(truncatedPath, "12");
        AssertFailure(AdminLogFileOpenFailure.FileChanged, () =>
            _opener.Open(directory.Source("api"), truncatedClaim, 100));

        var appendedPath = directory.CreateFile("appended.log", "123");
        var appendedClaim = Claim(directory, appendedPath);
        File.AppendAllText(appendedPath, "456");
        using var opened = _opener.Open(directory.Source("api"), appendedClaim, 100);
        Assert.Equal(6, opened.Length);
    }

    [Fact]
    public void Current_size_limit_is_enforced_after_open_and_exact_limit_is_allowed()
    {
        using var directory = new TemporaryDirectory();
        var exactPath = directory.CreateFile("exact.log", "12345");
        using var exact = _opener.Open(directory.Source("api"), Claim(directory, exactPath), 5);
        Assert.Equal(5, exact.Length);

        var largePath = directory.CreateFile("large.log", "123456");
        AssertFailure(AdminLogFileOpenFailure.FileTooLarge, () =>
            _opener.Open(directory.Source("api"), Claim(directory, largePath), 5));
    }

    [Fact]
    public async Task Duplicate_basename_resolves_only_inside_claimed_source_and_unicode_opens()
    {
        using var first = new TemporaryDirectory();
        using var second = new TemporaryDirectory();
        var firstPath = first.CreateFile("应用-日志.log", "first");
        second.CreateFile("应用-日志.log", "second");
        var claim = Claim(first, firstPath);

        await using var opened = _opener.Open(first.Source("first"), claim, 100);
        var bytes = new byte[5];
        await opened.Stream.ReadExactlyAsync(bytes);
        Assert.Equal("first", System.Text.Encoding.UTF8.GetString(bytes));
    }

    [Fact]
    public void Symlinks_inside_outside_and_into_another_source_are_rejected_when_supported()
    {
        using var source = new TemporaryDirectory();
        using var other = new TemporaryDirectory();
        var insideTarget = source.CreateFile("inside-target.log", "inside");
        var outsideTarget = other.CreateFile("outside-target.log", "outside");

        foreach (var pair in new[]
                 {
                     ("inside-link.log", insideTarget),
                     ("outside-link.log", outsideTarget),
                     ("other-source-link.log", outsideTarget),
                 })
        {
            var link = Path.Combine(source.Path, pair.Item1);
            try
            {
                File.CreateSymbolicLink(link, pair.Item2);
            }
            catch (Exception exception) when (exception is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
            {
                return;
            }

            var claim = BasicClaim(source, pair.Item1, new FileInfo(pair.Item2).Length);
            AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () =>
                _opener.Open(source.Source("api"), claim, 100));
        }
    }

    [WindowsFact]
    public void Windows_root_reparse_point_is_rejected()
    {
        using var parent = new TemporaryDirectory();
        using var target = new TemporaryDirectory();
        var link = Path.Combine(parent.Path, "linked-root");
        var reparseRoot = link;
        try
        {
            Directory.CreateSymbolicLink(link, target.Path);
        }
        catch (Exception exception) when (exception is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
        {
            reparseRoot = KnownWindowsReparseDirectory() ?? string.Empty;
            if (reparseRoot.Length == 0)
                return;
        }

        var source = new AdminLogSourceOptions { Key = "api", DisplayName = "API", Directory = reparseRoot };
        AssertFailure(AdminLogFileOpenFailure.SourceUnavailable, () =>
            _opener.Open(source, BasicClaim(target, "anything.log", 0), 100));
    }

    [WindowsFact]
    public void Windows_final_reparse_entry_is_rejected_when_available()
    {
        var entry = KnownWindowsReparseDirectory();
        if (entry is null)
            return;

        var root = Directory.GetParent(entry)!.FullName;
        var source = new AdminLogSourceOptions { Key = "api", DisplayName = "API", Directory = root };
        var claim = new AdminLogFileIdPayload
        {
            SourceKey = "api",
            FileName = Path.GetFileName(entry),
            SizeBytes = 0,
        };

        AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () => _opener.Open(source, claim, 100));
    }

    [WindowsFact]
    public async Task Windows_fallback_shares_with_an_active_writer()
    {
        using var directory = new TemporaryDirectory();
        var path = directory.CreateFile("active.log", "initial");
        var claim = Claim(directory, path);
        await using var writer = new FileStream(
            path,
            FileMode.Append,
            FileAccess.Write,
            FileShare.ReadWrite | FileShare.Delete,
            4096,
            FileOptions.Asynchronous);
        await writer.WriteAsync(System.Text.Encoding.UTF8.GetBytes("-append"));
        await writer.FlushAsync();

        await using var opened = _opener.Open(directory.Source("api"), claim, 100);
        Assert.Equal(14, opened.Length);
    }

    [LinuxFact]
    public void Linux_root_component_symlink_is_rejected()
    {
        using var parent = new TemporaryDirectory();
        using var target = new TemporaryDirectory();
        target.CreateFile("file.log", "data");
        var linkedRoot = Path.Combine(parent.Path, "linked-root");
        Directory.CreateSymbolicLink(linkedRoot, target.Path);
        var source = new AdminLogSourceOptions { Key = "api", DisplayName = "API", Directory = linkedRoot };

        AssertFailure(AdminLogFileOpenFailure.SourceUnavailable, () =>
            _opener.Open(source, BasicClaim(target, "file.log", 4), 100));
    }

    [LinuxFact]
    public void Linux_fifo_is_rejected_without_blocking()
    {
        using var directory = new TemporaryDirectory();
        var fifo = Path.Combine(directory.Path, "pipe.log");
        if (MkFifo(fifo, Convert.ToUInt32("600", 8)) != 0)
            return;

        AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () =>
            _opener.Open(directory.Source("api"), BasicClaim(directory, "pipe.log", 0), 100));
    }

    [LinuxFact]
    public void Linux_unix_socket_is_rejected()
    {
        using var directory = new TemporaryDirectory();
        var socketPath = Path.Combine(directory.Path, "socket.log");
        using var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        socket.Bind(new UnixDomainSocketEndPoint(socketPath));

        AssertFailure(AdminLogFileOpenFailure.FileUnavailable, () =>
            _opener.Open(directory.Source("api"), BasicClaim(directory, "socket.log", 0), 100));
    }

    private AdminLogFileIdPayload Claim(TemporaryDirectory directory, string path)
    {
        Assert.True(_metadataReader.TryReadRegularFile(path, out var metadata));
        var claim = BasicClaim(directory, Path.GetFileName(path), metadata.SizeBytes);
        claim.LastModifiedUtc = metadata.LastModifiedUtc;
        claim.DeviceId = metadata.DeviceId;
        claim.Inode = metadata.Inode;
        return claim;
    }

    private static AdminLogFileIdPayload BasicClaim(TemporaryDirectory directory, string name, long size)
    {
        var source = directory.Source("api");
        return new AdminLogFileIdPayload
        {
            SourceKey = source.Key,
            FileName = name,
            RootFingerprint = AdminLogAppService.CreateRootFingerprint(source),
            SizeBytes = size,
        };
    }

    private static void AssertFailure(AdminLogFileOpenFailure failure, Action action)
    {
        var exception = Assert.Throws<AdminLogFileOpenException>(action);
        Assert.Equal(failure, exception.Failure);
        Assert.DoesNotContain(Path.DirectorySeparatorChar.ToString(), exception.Message, StringComparison.Ordinal);
    }

    private static string? KnownWindowsReparseDirectory()
    {
        foreach (var candidate in new[]
                 {
                     Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Application Data"),
                     Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "My Music"),
                     Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Application Data"),
                 })
        {
            try
            {
                if (Directory.Exists(candidate)
                    && (File.GetAttributes(candidate) & FileAttributes.ReparsePoint) != 0)
                    return candidate;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) { }
        }

        return null;
    }

    [DllImport("libc", EntryPoint = "mkfifo", SetLastError = true)]
    private static extern int MkFifo([MarshalAs(UnmanagedType.LPUTF8Str)] string path, uint mode);

    private sealed class TemporaryDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(), $"teenova-download-{Guid.NewGuid():N}");

        public TemporaryDirectory() => Directory.CreateDirectory(Path);

        public string CreateFile(string name, string content)
        {
            var path = System.IO.Path.Combine(Path, name);
            File.WriteAllText(path, content);
            return path;
        }

        public AdminLogSourceOptions Source(string key) => new()
        {
            Key = key,
            DisplayName = key,
            Directory = Path,
        };

        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) { }
        }
    }
}

public sealed class LinuxFactAttribute : FactAttribute
{
    public LinuxFactAttribute()
    {
        if (!OperatingSystem.IsLinux())
            Skip = "Linux-only stable-handle security test.";
    }
}

public sealed class WindowsFactAttribute : FactAttribute
{
    public WindowsFactAttribute()
    {
        if (!OperatingSystem.IsWindows())
            Skip = "Windows fallback security test.";
    }
}
