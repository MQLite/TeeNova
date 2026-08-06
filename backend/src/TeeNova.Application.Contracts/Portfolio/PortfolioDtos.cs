using Microsoft.AspNetCore.Http;
using System.Text.Json.Serialization;
using TeeNova.Enquiries;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Portfolio;

public sealed class PortfolioImageDto
{
    public Guid Id { get; set; }
    public string AltText { get; set; } = "";
    public PortfolioPermissionSource PermissionSource { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PermissionReference { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? OriginalFileName { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public bool IsPrimary { get; set; }
    public int SortOrder { get; set; }
    public string Url { get; set; } = "";
}

public sealed class PortfolioItemDto : FullAuditedEntityDto<Guid>
{
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public QuoteServiceType ServiceType { get; set; }
    public string ShortCaption { get; set; } = "";
    public string? LongDescription { get; set; }
    public PortfolioStatus Status { get; set; }
    public int SortOrder { get; set; }
    public bool IsFeatured { get; set; }
    public DateTime? PublishedAt { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ConcurrencyStamp { get; set; }
    public List<PortfolioImageDto> Images { get; set; } = [];
}

public sealed class GetPortfolioItemsInput : PagedAndSortedResultRequestDto
{
    public string? Search { get; set; }
    public PortfolioStatus? Status { get; set; }
    public QuoteServiceType? ServiceType { get; set; }
    public bool? IsFeatured { get; set; }
}

public class CreatePortfolioItemDto
{
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public QuoteServiceType ServiceType { get; set; }
    public string ShortCaption { get; set; } = "";
    public string? LongDescription { get; set; }
    public int SortOrder { get; set; }
    public bool IsFeatured { get; set; }
}

public sealed class UpdatePortfolioItemDto : CreatePortfolioItemDto
{
    public string ConcurrencyStamp { get; set; } = "";
}

public sealed class UpdatePortfolioImageDto
{
    public string AltText { get; set; } = "";
    public PortfolioPermissionSource PermissionSource { get; set; }
    public string PermissionReference { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsPrimary { get; set; }
}

public sealed class PortfolioImageUploadDto { public IFormFile File { get; set; } = default!; }
public sealed record PortfolioImageContent(Stream Stream, string ContentType, string Sha256, DateTimeOffset LastModified);
