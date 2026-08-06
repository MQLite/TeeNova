using TeeNova.Enquiries;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Portfolio;

public class PortfolioItem : FullAuditedAggregateRoot<Guid>
{
    public string Title { get; set; } = default!;
    public string Slug { get; set; } = default!;
    public QuoteServiceType ServiceType { get; set; }
    public string ShortCaption { get; set; } = default!;
    public string? LongDescription { get; set; }
    public PortfolioStatus Status { get; set; } = PortfolioStatus.Draft;
    public int SortOrder { get; set; }
    public bool IsFeatured { get; set; }
    public DateTime? PublishedAt { get; set; }
    public ICollection<PortfolioItemImage> Images { get; set; } = new List<PortfolioItemImage>();

    protected PortfolioItem() { }
    public PortfolioItem(Guid id) : base(id) { }
}

