using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Portfolio;

public class PortfolioItemImage : CreationAuditedEntity<Guid>
{
    public Guid PortfolioItemId { get; set; }
    public string ObjectKey { get; set; } = default!;
    public string OriginalFileName { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = default!;
    public int Width { get; set; }
    public int Height { get; set; }
    // Upload creates the image before an Admin can enter publication metadata. These columns are
    // required in SQL, so the editable draft state must be represented by empty strings, not null.
    public string AltText { get; set; } = string.Empty;
    public PortfolioPermissionSource PermissionSource { get; set; }
    public string PermissionReference { get; set; } = string.Empty;
    public bool IsPrimary { get; set; }
    public int SortOrder { get; set; }
    public PortfolioItem? PortfolioItem { get; set; }

    protected PortfolioItemImage() { }
    public PortfolioItemImage(Guid id) : base(id) { }
}
