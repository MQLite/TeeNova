using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace TeeNova.AdminLogs;

internal sealed record AdminLogHandleMetadata(
    long SizeBytes,
    DateTime LastModifiedUtc,
    ulong DeviceId,
    ulong Inode);

internal static class WindowsAdminLogFileHandle
{
    public static bool TryOpenRegularFile(
        string path,
        out SafeFileHandle? handle,
        out AdminLogHandleMetadata? metadata)
    {
        handle = null;
        metadata = null;

        var opened = CreateFile(
            path,
            GenericRead,
            FileShareRead | FileShareWrite | FileShareDelete,
            IntPtr.Zero,
            OpenExisting,
            FileFlagOverlapped | FileFlagOpenReparsePoint | FileFlagSequentialScan,
            IntPtr.Zero);

        if (opened.IsInvalid)
        {
            opened.Dispose();
            return false;
        }

        if (GetFileType(opened) != FileTypeDisk
            || !GetFileInformationByHandle(opened, out var information)
            || (information.FileAttributes & (FileAttributeDirectory | FileAttributeReparsePoint | FileAttributeDevice)) != 0)
        {
            opened.Dispose();
            return false;
        }

        var size = ((ulong)information.FileSizeHigh << 32) | information.FileSizeLow;
        if (size > long.MaxValue)
        {
            opened.Dispose();
            return false;
        }

        var fileTime = ((long)information.LastWriteTimeHigh << 32) | information.LastWriteTimeLow;
        var fileIndex = ((ulong)information.FileIndexHigh << 32) | information.FileIndexLow;

        try
        {
            metadata = new AdminLogHandleMetadata(
                (long)size,
                DateTime.FromFileTimeUtc(fileTime),
                information.VolumeSerialNumber,
                fileIndex);
            handle = opened;
            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            opened.Dispose();
            return false;
        }
    }

    public static bool RootContainsReparsePoint(string configuredRoot)
    {
        var normalized = Path.GetFullPath(configuredRoot);
        var root = Path.GetPathRoot(normalized);
        if (string.IsNullOrEmpty(root))
            return true;

        var current = root;
        if (HasReparsePoint(current))
            return true;

        var remainder = normalized[root.Length..];
        foreach (var component in remainder.Split(
                     [Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar],
                     StringSplitOptions.RemoveEmptyEntries))
        {
            current = Path.Combine(current, component);
            if (HasReparsePoint(current))
                return true;
        }

        return false;
    }

    private static bool HasReparsePoint(string directory)
    {
        var attributes = File.GetAttributes(directory);
        return (attributes & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != FileAttributes.Directory;
    }

    private const uint GenericRead = 0x80000000;
    private const uint FileShareRead = 0x00000001;
    private const uint FileShareWrite = 0x00000002;
    private const uint FileShareDelete = 0x00000004;
    private const uint OpenExisting = 3;
    private const uint FileAttributeDirectory = 0x00000010;
    private const uint FileAttributeDevice = 0x00000040;
    private const uint FileAttributeReparsePoint = 0x00000400;
    private const uint FileFlagOverlapped = 0x40000000;
    private const uint FileFlagOpenReparsePoint = 0x00200000;
    private const uint FileFlagSequentialScan = 0x08000000;
    private const uint FileTypeDisk = 0x0001;

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint GetFileType(SafeFileHandle file);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle file,
        out ByHandleFileInformation information);

    [StructLayout(LayoutKind.Sequential)]
    private struct ByHandleFileInformation
    {
        public uint FileAttributes;
        public uint CreationTimeLow;
        public uint CreationTimeHigh;
        public uint LastAccessTimeLow;
        public uint LastAccessTimeHigh;
        public uint LastWriteTimeLow;
        public uint LastWriteTimeHigh;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }
}
