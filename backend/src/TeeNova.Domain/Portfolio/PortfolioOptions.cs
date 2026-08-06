namespace TeeNova.Portfolio;

public sealed class PortfolioOptions
{
    public const string SectionName = "Portfolio";
    public bool Enabled { get; set; }
    public string StorageRoot { get; set; } = "App_Data/portfolio-media";
    public long MaximumUploadBytes { get; set; } = 10 * 1024 * 1024;
    public long MaximumPixels { get; set; } = 40_000_000;
    public int MaximumImagesPerItem { get; set; } = 12;
}
