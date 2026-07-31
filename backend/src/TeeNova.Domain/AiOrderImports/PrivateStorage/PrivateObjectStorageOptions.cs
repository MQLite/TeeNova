namespace TeeNova.AiOrderImports.PrivateStorage;

public sealed class PrivateObjectStorageOptions
{
    public const string SectionName = "AiOrderPrivateStorage";

    /// <summary>
    /// Absolute path or a path relative to the application content root. This setting is required.
    /// The resolved path must not be inside wwwroot.
    /// </summary>
    public string? RootPath { get; set; }
    public long MinimumFreeSpaceBytes { get; set; } = 1_073_741_824;
    public string[] ForbiddenPathPrefixes { get; set; } = [];
}
