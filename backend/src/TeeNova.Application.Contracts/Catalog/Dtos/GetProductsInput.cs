using Volo.Abp.Application.Dtos;

namespace TeeNova.Catalog.Dtos;

public class GetProductsInput : PagedAndSortedResultRequestDto
{
    public string? Search { get; set; }
    public string? ProductType { get; set; }
    /// <summary>
    /// Defaults to true for the storefront. Pass null from admin to see all products.
    /// </summary>
    public bool? IsActive { get; set; } = true;
}
