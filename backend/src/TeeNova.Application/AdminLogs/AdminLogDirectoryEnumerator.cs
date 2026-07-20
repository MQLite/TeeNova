using System.Collections.Generic;
using System.IO;

namespace TeeNova.AdminLogs;

public interface IAdminLogDirectoryEnumerator
{
    bool Exists(string directory);
    IEnumerable<string> EnumerateImmediateEntries(string directory);
}

public sealed class AdminLogDirectoryEnumerator : IAdminLogDirectoryEnumerator
{
    public bool Exists(string directory) => Directory.Exists(directory);

    public IEnumerable<string> EnumerateImmediateEntries(string directory)
        => Directory.EnumerateFileSystemEntries(directory, "*", SearchOption.TopDirectoryOnly);
}
