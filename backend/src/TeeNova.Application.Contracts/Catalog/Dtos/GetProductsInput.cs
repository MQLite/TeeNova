using Volo.Abp.Application.Dtos;

namespace TeeNova.Catalog.Dtos;

public class GetProductsInput : PagedAndSortedResultRequestDto
{
    public string? Search { get; set; }
    public string? ProductType { get; set; }
    public bool? IsActive { get; set; } = true;
}
