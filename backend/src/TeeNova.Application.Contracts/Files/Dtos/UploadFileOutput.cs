using System;

namespace TeeNova.Files.Dtos;

public class UploadFileOutput
{
    public Guid AssetId { get; set; }
    public string FileUrl { get; set; } = default!;
    public string OriginalFileName { get; set; } = default!;
    public long FileSizeBytes { get; set; }
}
