using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace TeeNova.AdminLogs;

public enum AdminLogFileOpenFailure
{
    SourceUnavailable,
    FileUnavailable,
    FileChanged,
    FileTooLarge,
}

public sealed class AdminLogFileOpenException : Exception
{
    public AdminLogFileOpenException(AdminLogFileOpenFailure failure)
        : base("The admin log file could not be opened safely.")
    {
        Failure = failure;
    }

    public AdminLogFileOpenFailure Failure { get; }
}

public interface IAdminLogFileOpener
{
    OpenedFileHandle Open(
        AdminLogSourceOptions source,
        AdminLogFileIdPayload claim,
        long maximumDownloadBytes);
}

public sealed class OpenedFileHandle : IDisposable, IAsyncDisposable
{
    public OpenedFileHandle(Stream stream, long length, DateTime lastModifiedUtc)
    {
        Stream = stream;
        Length = length;
        LastModifiedUtc = lastModifiedUtc;
    }

    public Stream Stream { get; }
    public long Length { get; }
    public DateTime LastModifiedUtc { get; }
    public void Dispose() => Stream.Dispose();
    public ValueTask DisposeAsync() => Stream.DisposeAsync();
}

public sealed class AdminLogFileOpener : IAdminLogFileOpener
{
    public OpenedFileHandle Open(
        AdminLogSourceOptions source,
        AdminLogFileIdPayload claim,
        long maximumDownloadBytes)
    {
        if (OperatingSystem.IsLinux())
            return OpenLinux(source, claim, maximumDownloadBytes);
        if (OperatingSystem.IsWindows())
            return OpenWindows(source, claim, maximumDownloadBytes);

        throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);
    }

    private static OpenedFileHandle OpenLinux(
        AdminLogSourceOptions source,
        AdminLogFileIdPayload claim,
        long maximumDownloadBytes)
    {
        SafeFileHandle? rootHandle = null;
        SafeFileHandle? fileHandle = null;
        try
        {
            rootHandle = OpenLinuxRoot(source.Directory);
            var fileDescriptor = OpenAt(
                rootHandle.DangerousGetHandle().ToInt32(),
                claim.FileName,
                OpenReadOnly | OpenNoFollow | OpenCloseOnExec | OpenNonBlocking);
            if (fileDescriptor < 0)
                throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileUnavailable);

            fileHandle = new SafeFileHandle(new IntPtr(fileDescriptor), ownsHandle: true);
            var metadata = ReadLinuxHandleMetadata(fileDescriptor);
            ValidateOpenedFile(metadata, claim, maximumDownloadBytes);

            // A descriptor from raw openat is not opened for overlapped I/O, so the FileStream must be
            // constructed as synchronous; requesting isAsync here throws ArgumentException on Linux and
            // previously surfaced as a 503 SourceUnavailable for every download. Regular-file reads never
            // block, so asynchronous stream reads remain correct over a synchronous handle.
            var stream = new FileStream(fileHandle, FileAccess.Read, 64 * 1024, isAsync: false);
            fileHandle = null;
            return new OpenedFileHandle(stream, metadata.SizeBytes, metadata.LastModifiedUtc);
        }
        catch (AdminLogFileOpenException)
        {
            throw;
        }
        catch (Exception ex) when (ex is IOException
                                   or UnauthorizedAccessException
                                   or NotSupportedException
                                   or ArgumentException
                                   or EntryPointNotFoundException
                                   or DllNotFoundException)
        {
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);
        }
        finally
        {
            fileHandle?.Dispose();
            rootHandle?.Dispose();
        }
    }

    private static SafeFileHandle OpenLinuxRoot(string configuredRoot)
    {
        if (!Path.IsPathFullyQualified(configuredRoot) || configuredRoot.Length == 0 || configuredRoot[0] != '/')
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);

        var descriptor = Open("/", OpenReadOnly | OpenDirectory | OpenNoFollow | OpenCloseOnExec);
        if (descriptor < 0)
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);

        var current = new SafeFileHandle(new IntPtr(descriptor), ownsHandle: true);
        try
        {
            foreach (var component in configuredRoot.Split('/', StringSplitOptions.RemoveEmptyEntries))
            {
                if (component is "." or "..")
                    throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);

                var nextDescriptor = OpenAt(
                    current.DangerousGetHandle().ToInt32(),
                    component,
                    OpenReadOnly | OpenDirectory | OpenNoFollow | OpenCloseOnExec);
                if (nextDescriptor < 0)
                    throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);

                var next = new SafeFileHandle(new IntPtr(nextDescriptor), ownsHandle: true);
                current.Dispose();
                current = next;
            }

            var result = current;
            current = null!;
            return result;
        }
        finally
        {
            current?.Dispose();
        }
    }

    private static AdminLogHandleMetadata ReadLinuxHandleMetadata(int fileDescriptor)
    {
        if (Statx(fileDescriptor, string.Empty, AtEmptyPath | AtSymlinkNoFollow, StatxBasicStats, out var stat) != 0
            || (stat.Mode & FileTypeMask) != RegularFileType
            || stat.Size > long.MaxValue)
        {
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileUnavailable);
        }

        try
        {
            var modified = DateTimeOffset.FromUnixTimeSeconds(stat.ModifiedTime.Seconds)
                .AddTicks(stat.ModifiedTime.Nanoseconds / 100)
                .UtcDateTime;
            var device = ((ulong)stat.DeviceMajor << 32) | stat.DeviceMinor;
            return new AdminLogHandleMetadata((long)stat.Size, modified, device, stat.Inode);
        }
        catch (ArgumentOutOfRangeException)
        {
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileUnavailable);
        }
    }

    private static OpenedFileHandle OpenWindows(
        AdminLogSourceOptions source,
        AdminLogFileIdPayload claim,
        long maximumDownloadBytes)
    {
        try
        {
            if (!Directory.Exists(source.Directory)
                || WindowsAdminLogFileHandle.RootContainsReparsePoint(source.Directory))
            {
                throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);
            }

            var candidate = Path.Combine(source.Directory, claim.FileName);
            if (!WindowsAdminLogFileHandle.TryOpenRegularFile(candidate, out var handle, out var metadata))
                throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileUnavailable);

            try
            {
                ValidateOpenedFile(metadata!, claim, maximumDownloadBytes);
                var stream = new FileStream(handle!, FileAccess.Read, 64 * 1024, isAsync: true);
                handle = null;
                return new OpenedFileHandle(stream, metadata!.SizeBytes, metadata.LastModifiedUtc);
            }
            finally
            {
                handle?.Dispose();
            }
        }
        catch (AdminLogFileOpenException)
        {
            throw;
        }
        catch (Exception ex) when (ex is IOException
                                   or UnauthorizedAccessException
                                   or NotSupportedException
                                   or ArgumentException)
        {
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.SourceUnavailable);
        }
    }

    private static void ValidateOpenedFile(
        AdminLogHandleMetadata metadata,
        AdminLogFileIdPayload claim,
        long maximumDownloadBytes)
    {
        if (claim.DeviceId.HasValue
            && claim.Inode.HasValue
            && (claim.DeviceId.Value != metadata.DeviceId || claim.Inode.Value != metadata.Inode))
        {
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileChanged);
        }

        if (metadata.SizeBytes < claim.SizeBytes)
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileChanged);
        if (metadata.SizeBytes > maximumDownloadBytes)
            throw new AdminLogFileOpenException(AdminLogFileOpenFailure.FileTooLarge);
    }

    private const int OpenReadOnly = 0;
    private const int OpenCloseOnExec = 0x80000;
    private const int OpenNonBlocking = 0x800;
    private const int OpenDirectory = 0x10000;
    private const int OpenNoFollow = 0x20000;
    private const int AtSymlinkNoFollow = 0x100;
    private const int AtEmptyPath = 0x1000;
    private const uint StatxBasicStats = 0x07ff;
    private const ushort FileTypeMask = 0xf000;
    private const ushort RegularFileType = 0x8000;

    [DllImport("libc", EntryPoint = "open", SetLastError = true)]
    private static extern int Open(
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        int flags);

    [DllImport("libc", EntryPoint = "openat", SetLastError = true)]
    private static extern int OpenAt(
        int directoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        int flags);

    [DllImport("libc", EntryPoint = "statx", SetLastError = true)]
    private static extern int Statx(
        int directoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        int flags,
        uint mask,
        out StatxBuffer buffer);

    [StructLayout(LayoutKind.Sequential)]
    private struct StatxTimestamp
    {
        public long Seconds;
        public uint Nanoseconds;
        public int Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StatxBuffer
    {
        public uint Mask;
        public uint BlockSize;
        public ulong Attributes;
        public uint LinkCount;
        public uint UserId;
        public uint GroupId;
        public ushort Mode;
        public ushort Spare0;
        public ulong Inode;
        public ulong Size;
        public ulong Blocks;
        public ulong AttributesMask;
        public StatxTimestamp AccessTime;
        public StatxTimestamp BirthTime;
        public StatxTimestamp ChangeTime;
        public StatxTimestamp ModifiedTime;
        public uint DeviceIdMajor;
        public uint DeviceIdMinor;
        public uint DeviceMajor;
        public uint DeviceMinor;
        public ulong MountId;
        public uint DirectIoMemoryAlignment;
        public uint DirectIoOffsetAlignment;
        public ulong Spare30;
        public ulong Spare31;
        public ulong Spare32;
        public ulong Spare33;
        public ulong Spare34;
        public ulong Spare35;
        public ulong Spare36;
        public ulong Spare37;
        public ulong Spare38;
        public ulong Spare39;
        public ulong Spare310;
        public ulong Spare311;
    }
}
