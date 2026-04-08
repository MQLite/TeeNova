using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using TeeNova.Catalog;
using Volo.Abp;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.DataSeeding;

public class TeeNovaDataSeedContributor : IDataSeedContributor, ITransientDependency
{
    // Fixed GUIDs so seeding is idempotent across restarts
    private static readonly Guid ClassicTeeId  = new("00000001-0000-0000-0000-000000000001");
    private static readonly Guid PremiumTeeId  = new("00000002-0000-0000-0000-000000000002");
    private static readonly Guid OversizedTeeId = new("00000003-0000-0000-0000-000000000003");

    private readonly IRepository<Product, Guid> _productRepository;
    private readonly IDataFilter _dataFilter;
    private readonly IConfiguration _configuration;

    public TeeNovaDataSeedContributor(
        IRepository<Product, Guid> productRepository,
        IDataFilter dataFilter,
        IConfiguration configuration)
    {
        _productRepository = productRepository;
        _dataFilter = dataFilter;
        _configuration = configuration;
    }

    public async Task SeedAsync(DataSeedContext context)
    {
        var baseUrl = _configuration["App:SelfUrl"]?.TrimEnd('/') ?? "https://localhost:44300";

        // Disable soft-delete filter so records deleted via UI still block re-insertion
        // (their variants still hold unique SKU constraints in the DB).
        HashSet<Guid> existingIds;
        using (_dataFilter.Disable<ISoftDelete>())
        {
            existingIds = [.. (await _productRepository.GetListAsync(
                p => p.Id == ClassicTeeId || p.Id == PremiumTeeId || p.Id == OversizedTeeId,
                includeDetails: false))
                .Select(p => p.Id)];
        }

        if (!existingIds.Contains(ClassicTeeId))
            await SeedProduct(new Product(ClassicTeeId, "Classic Cotton Tee", 29.99m, "tshirt")
            {
                Description = "A timeless everyday classic. Soft 100% cotton with a relaxed fit, perfect for vibrant custom prints. Available in multiple colors and sizes.",
                IsActive = true
            }, baseUrl + "/images/products/classic-tee.svg",
            ["White", "Black", "Navy Blue"],
            ["S", "M", "L", "XL", "XXL"],
            "CCT");

        if (!existingIds.Contains(PremiumTeeId))
            await SeedProduct(new Product(PremiumTeeId, "Premium Unisex T-Shirt", 39.99m, "tshirt")
            {
                Description = "Premium quality unisex tee in a soft cotton-modal blend. Modern slim fit with a reinforced collar — ideal for bold custom artwork.",
                IsActive = true
            }, baseUrl + "/images/products/premium-tee.svg",
            ["Charcoal", "White", "Forest Green"],
            ["S", "M", "L", "XL"],
            "PUT", xlSurcharge: 2.00m);

        if (!existingIds.Contains(OversizedTeeId))
            await SeedProduct(new Product(OversizedTeeId, "Oversized Street Tee", 49.99m, "tshirt")
            {
                Description = "Streetwear-inspired oversized tee with dropped shoulders. Heavy 280gsm cotton gives a premium feel — perfect for full-front oversized prints.",
                IsActive = true
            }, baseUrl + "/images/products/oversized-tee.svg",
            ["Black", "Sand", "Bone White"],
            ["M", "L", "XL", "XXL"],
            "OST", xxlSurcharge: 5.00m);
    }

    private async Task SeedProduct(
        Product product, string imageUrl,
        string[] colors, string[] sizes, string skuPrefix,
        decimal xlSurcharge = 0m, decimal xxlSurcharge = 0m)
    {
        foreach (var color in colors)
        {
            foreach (var size in sizes)
            {
                var adjustment = size == "XL"  ? xlSurcharge
                               : size == "XXL" ? xxlSurcharge
                               : 0m;

                product.Variants.Add(new ProductVariant(
                    Guid.NewGuid(), product.Id,
                    $"{skuPrefix}-{color.Replace(" ", "")[..Math.Min(3, color.Replace(" ", "").Length)]}{size}", color, size)
                {
                    StockQuantity = 100,
                    IsAvailable   = true,
                    PriceAdjustment = adjustment
                });
            }
        }

        product.Images.Add(new ProductImage(
            Guid.NewGuid(), product.Id, imageUrl, isPrimary: true) { SortOrder = 0 });

        await _productRepository.InsertAsync(product, autoSave: true);
    }
}
