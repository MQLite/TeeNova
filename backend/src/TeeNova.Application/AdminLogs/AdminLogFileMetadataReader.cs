using System;
using System.IO;
using System.Runtime.InteropServices;

namespace TeeNova.AdminLogs;

public sealed record AdminLogFileMetadata(
    long SizeBytes,
    DateTime LastModifiedUtc,
    ulong? DeviceId,
    ulong? Inode);

public interface IAdminLogFileMetadataReader
{
    bool TryReadRegularFile(string path, out AdminLogFileMetadata metadata);
}

public sealed class AdminLogFileMetadataReader : IAdminLogFileMetadataReader
{
    public bool TryReadRegularFile(string path, out AdminLogFileMetadata metadata)
    {
        metadata = default!;

        try
        {
            if (OperatingSystem.IsLinux())
                return TryReadLinux(path, out metadata);

            if (!OperatingSystem.IsWindows()
                || !WindowsAdminLogFileHandle.TryOpenRegularFile(path, out var handle, out var openedMetadata))
                return false;

            using (handle)
            {
                metadata = new AdminLogFileMetadata(
                    openedMetadata!.SizeBytes,
                    openedMetadata.LastModifiedUtc,
                    openedMetadata.DeviceId,
                    openedMetadata.Inode);
            }
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            return false;
        }
    }

    private static bool TryReadLinux(string path, out AdminLogFileMetadata metadata)
    {
        metadata = default!;

        try
        {
            if (Statx(AtFileDescriptorCurrentWorkingDirectory, path, AtSymlinkNoFollow, StatxBasicStats, out var stat) != 0)
                return false;

            if ((stat.Mode & FileTypeMask) != RegularFileType || stat.Size > long.MaxValue)
                return false;

            var modified = DateTimeOffset.FromUnixTimeSeconds(stat.ModifiedTime.Seconds)
                .AddTicks(stat.ModifiedTime.Nanoseconds / 100)
                .UtcDateTime;
            var device = ((ulong)stat.DeviceMajor << 32) | stat.DeviceMinor;

            metadata = new AdminLogFileMetadata((long)stat.Size, modified, device, stat.Inode);
            return true;
        }
        catch (Exception ex) when (ex is EntryPointNotFoundException or DllNotFoundException or ArgumentOutOfRangeException)
        {
            // Fail closed when stable no-follow metadata inspection is unavailable.
            return false;
        }
    }

    private const int AtFileDescriptorCurrentWorkingDirectory = -100;
    private const int AtSymlinkNoFollow = 0x100;
    private const uint StatxBasicStats = 0x07ff;
    private const ushort FileTypeMask = 0xf000;
    private const ushort RegularFileType = 0x8000;

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

    // Linux statx has a stable 256-byte userspace ABI across supported architectures.
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
