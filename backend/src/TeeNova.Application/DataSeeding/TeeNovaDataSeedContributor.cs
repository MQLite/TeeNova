using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TeeNova.Catalog;
using TeeNova.Customization;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Timing;

namespace TeeNova.DataSeeding;

public class TeeNovaDataSeedContributor : IDataSeedContributor, ITransientDependency
{
    // 鈹€鈹€ Product GUIDs (fixed, idempotent) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    private static readonly Guid ClassicTeeId   = new("00000001-0000-0000-0000-000000000001");
    private static readonly Guid PremiumTeeId   = new("00000002-0000-0000-0000-000000000002");
    private static readonly Guid OversizedTeeId = new("00000003-0000-0000-0000-000000000003");

    // 鈹€鈹€ Order GUIDs (fixed, idempotent) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    private static readonly Guid Order1Id = new("a0000001-0000-0000-0000-000000000001"); // Completed
    private static readonly Guid Order2Id = new("a0000002-0000-0000-0000-000000000002"); // Printing
    private static readonly Guid Order3Id = new("a0000003-0000-0000-0000-000000000003"); // Reviewing
    private static readonly Guid Order4Id = new("a0000004-0000-0000-0000-000000000004"); // Completed
    private static readonly Guid Order5Id = new("a0000005-0000-0000-0000-000000000005"); // Paid
    private static readonly Guid Order6Id = new("a0000006-0000-0000-0000-000000000006"); // Pending

    // 鈹€鈹€ Order item GUIDs (fixed so assets can reference them) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    private static readonly Guid Item1Id = new("c0000001-0000-0000-0000-000000000001"); // Order1 item
    private static readonly Guid Item2Id = new("c0000002-0000-0000-0000-000000000002"); // Order2 item
    private static readonly Guid Item3Id = new("c0000003-0000-0000-0000-000000000003"); // Order3 item
    private static readonly Guid Item4Id = new("c0000004-0000-0000-0000-000000000004"); // Order4 item
    private static readonly Guid Item5Id = new("c0000005-0000-0000-0000-000000000005"); // Order5 item
    private static readonly Guid Item6aId = new("c0000006-0000-0000-0000-000000000006"); // Order6 item 1
    private static readonly Guid Item6bId = new("c0000007-0000-0000-0000-000000000007"); // Order6 item 2

    // 鈹€鈹€ Asset GUIDs (fixed, idempotent) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    private static readonly Guid Asset1Id = new("b0000001-0000-0000-0000-000000000001"); // Order1 鈥?birthday design
    private static readonly Guid Asset2Id = new("b0000002-0000-0000-0000-000000000002"); // Order2 鈥?club crest
    private static readonly Guid Asset3Id = new("b0000003-0000-0000-0000-000000000003"); // Order5 鈥?company logo
    private static readonly Guid Asset4Id = new("b0000004-0000-0000-0000-000000000004"); // Order6 鈥?staff uniform logo

    private readonly IRepository<Product, Guid>       _productRepository;
    private readonly IRepository<Order, Guid>         _orderRepository;
    private readonly IRepository<UploadedAsset, Guid> _assetRepository;
    private readonly IDataFilter _dataFilter;
    private readonly IConfiguration _configuration;
    private readonly IClock _clock;

    public TeeNovaDataSeedContributor(
        IRepository<Product, Guid>       productRepository,
        IRepository<Order, Guid>         orderRepository,
        IRepository<UploadedAsset, Guid> assetRepository,
        IDataFilter dataFilter,
        IConfiguration configuration,
        IClock clock)
    {
        _productRepository = productRepository;
        _orderRepository   = orderRepository;
        _assetRepository   = assetRepository;
        _dataFilter        = dataFilter;
        _configuration     = configuration;
        _clock             = clock;
    }

    public async Task SeedAsync(DataSeedContext context)
    {
        await Task.CompletedTask;
    }

    // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    // Products
    // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

    private async Task SeedProductsAsync(string baseUrl)
    {
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
                Description = "Premium quality unisex tee in a soft cotton-modal blend. Modern slim fit with a reinforced collar 鈥?ideal for bold custom artwork.",
                IsActive = true
            }, baseUrl + "/images/products/premium-tee.svg",
            ["Charcoal", "White", "Forest Green"],
            ["S", "M", "L", "XL"],
            "PUT", xlSurcharge: 2.00m);

        if (!existingIds.Contains(OversizedTeeId))
            await SeedProduct(new Product(OversizedTeeId, "Oversized Street Tee", 49.99m, "tshirt")
            {
                Description = "Streetwear-inspired oversized tee with dropped shoulders. Heavy 280gsm cotton gives a premium feel 鈥?perfect for full-front oversized prints.",
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
                    StockQuantity  = 100,
                    IsAvailable    = true,
                    PriceAdjustment = adjustment
                });
            }
        }

        product.Images.Add(new ProductImage(
            Guid.NewGuid(), product.Id, imageUrl, isPrimary: true) { SortOrder = 0 });

        await _productRepository.InsertAsync(product, autoSave: true);
    }

    // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    // Demo Assets
    // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

    private async Task SeedAssetsAsync(string baseUrl)
    {
        var existingIds = (await _assetRepository.GetListAsync(
            a => a.Id == Asset1Id || a.Id == Asset2Id || a.Id == Asset3Id || a.Id == Asset4Id,
            includeDetails: false))
            .Select(a => a.Id)
            .ToHashSet();

        if (!existingIds.Contains(Asset1Id))
            await _assetRepository.InsertAsync(new UploadedAsset(
                Asset1Id,
                "sarah_birthday_design.svg",
                baseUrl + "/images/products/classic-tee.svg",
                "image/svg+xml",
                42_500), autoSave: true);

        if (!existingIds.Contains(Asset2Id))
            await _assetRepository.InsertAsync(new UploadedAsset(
                Asset2Id,
                "auckland_fc_crest_hires.png",
                baseUrl + "/images/products/classic-tee.svg",
                "image/png",
                218_000), autoSave: true);

        if (!existingIds.Contains(Asset3Id))
            await _assetRepository.InsertAsync(new UploadedAsset(
                Asset3Id,
                "patel_company_logo.svg",
                baseUrl + "/images/products/premium-tee.svg",
                "image/svg+xml",
                31_200), autoSave: true);

        if (!existingIds.Contains(Asset4Id))
            await _assetRepository.InsertAsync(new UploadedAsset(
                Asset4Id,
                "wilson_associates_logo.ai",
                baseUrl + "/images/products/premium-tee.svg",
                "application/illustrator",
                156_800), autoSave: true);
    }

    // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    // Demo Orders
    // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

    private async Task SeedOrdersAsync(string baseUrl)
    {
        var existingOrderIds = (await _orderRepository.GetListAsync(
            o => o.Id == Order1Id || o.Id == Order2Id || o.Id == Order3Id ||
                 o.Id == Order4Id || o.Id == Order5Id || o.Id == Order6Id,
            includeDetails: false))
            .Select(o => o.Id)
            .ToHashSet();

        if (existingOrderIds.Count == 6) return;

        var productQuery = await _productRepository.GetQueryableAsync();
        var products = productQuery
            .Where(p => p.Id == ClassicTeeId || p.Id == PremiumTeeId || p.Id == OversizedTeeId)
            .Include(p => p.Variants)
            .ToList();

        var classic = products.FirstOrDefault(p => p.Id == ClassicTeeId);
        var premium = products.FirstOrDefault(p => p.Id == PremiumTeeId);
        var oversized = products.FirstOrDefault(p => p.Id == OversizedTeeId);

        if (classic == null || premium == null || oversized == null) return;

        var now = _clock.Now;

        if (!existingOrderIds.Contains(Order1Id))
        {
            var variant = FindVariant(classic, "White", "M");
            var order = new Order(Order1Id, "Sarah Thompson", "sarah.thompson@gmail.com",
                new ShippingAddress("Sarah Thompson", "12 Ponsonby Road", "Auckland", "Auckland", "1011", "NZ",
                    phone: "+64 21 234 5678"))
            { CreationTime = now.AddDays(-1) };
            var item = new OrderItem(Item1Id, Order1Id,
                classic.Id, variant.Id, classic.Name, $"{variant.Color} / {variant.Size}",
                3, classic.BasePrice + variant.PriceAdjustment);
            item.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.FrontCenter, Asset1Id, baseUrl + "/images/products/classic-tee.svg", "Sarah's custom birthday design");
            order.AddItem(item);
            order.UpdateStatus(OrderStatus.Paid);
            order.UpdateStatus(OrderStatus.Reviewing);
            order.ApproveForPrinting();
            order.StartPrinting();
            order.MarkReady();
            order.Complete();
            await _orderRepository.InsertAsync(order, autoSave: true);
        }

        if (!existingOrderIds.Contains(Order2Id))
        {
            var variant = FindVariant(classic, "Navy Blue", "XL");
            var order = new Order(Order2Id, "Auckland FC", "admin@aucklandfc.co.nz",
                new ShippingAddress("Auckland FC", "55 Albert Street", "Auckland", "Auckland", "1010", "NZ",
                    phone: "+64 9 358 1234"))
            { Notes = "Team jersey order 鈥?logo on front, number on back. Needed ASAP.", CreationTime = now.AddDays(-2) };
            var item = new OrderItem(Item2Id, Order2Id,
                classic.Id, variant.Id, classic.Name, $"{variant.Color} / {variant.Size}",
                10, classic.BasePrice + variant.PriceAdjustment);
            item.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.FrontCenter, Asset2Id, baseUrl + "/images/products/classic-tee.svg", "Club crest 鈥?high-res file provided");
            order.AddItem(item);
            order.UpdateStatus(OrderStatus.Paid);
            order.UpdateStatus(OrderStatus.Reviewing);
            order.ApproveForPrinting();
            order.StartPrinting();
            await _orderRepository.InsertAsync(order, autoSave: true);
        }

        if (!existingOrderIds.Contains(Order3Id))
        {
            var variant = FindVariant(classic, "White", "L");
            var order = new Order(Order3Id, "Riverside Community Church", "events@riversidechurch.org.nz",
                new ShippingAddress("Riverside Community Church", "88 Henderson Valley Road",
                    "Henderson", "Auckland", "0612", "NZ"))
            { Notes = "Annual family fun day shirts 鈥?needed by 5 April. Print on front and back.", CreationTime = now.AddDays(-3) };
            var item = new OrderItem(Item3Id, Order3Id,
                classic.Id, variant.Id, classic.Name, $"{variant.Color} / {variant.Size}",
                25, classic.BasePrice + variant.PriceAdjustment);
            item.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.FrontCenter);
            order.AddItem(item);
            order.UpdateStatus(OrderStatus.Paid);
            order.UpdateStatus(OrderStatus.Reviewing);
            await _orderRepository.InsertAsync(order, autoSave: true);
        }

        if (!existingOrderIds.Contains(Order4Id))
        {
            var variant = FindVariant(oversized, "Black", "M");
            var order = new Order(Order4Id, "Grace Kim", "grace.kim@outlook.com",
                new ShippingAddress("Grace Kim", "3/24 Beach Road", "Takapuna", "Auckland", "0622", "NZ",
                    phone: "+64 21 876 5432"))
            { CreationTime = now.AddDays(-4) };
            var item = new OrderItem(Item4Id, Order4Id,
                oversized.Id, variant.Id, oversized.Name, $"{variant.Color} / {variant.Size}",
                1, oversized.BasePrice + variant.PriceAdjustment);
            item.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.FrontCenter, designNote: "Minimalist line-art design 鈥?see uploaded file");
            order.AddItem(item);
            order.UpdateStatus(OrderStatus.Paid);
            order.UpdateStatus(OrderStatus.Reviewing);
            order.ApproveForPrinting();
            order.StartPrinting();
            order.MarkReady();
            order.Complete();
            await _orderRepository.InsertAsync(order, autoSave: true);
        }

        if (!existingOrderIds.Contains(Order5Id))
        {
            var variant = FindVariant(premium, "Charcoal", "L");
            var order = new Order(Order5Id, "James Patel", "james.patel@gmail.com",
                new ShippingAddress("James Patel", "7 Queen Street", "Onehunga", "Auckland", "1061", "NZ",
                    phone: "+64 21 456 7890"))
            { Notes = "Small chest logo 鈥?design file attached. Please confirm placement before printing.", CreationTime = now.AddDays(-5) };
            var item = new OrderItem(Item5Id, Order5Id,
                premium.Id, variant.Id, premium.Name, $"{variant.Color} / {variant.Size}",
                2, premium.BasePrice + variant.PriceAdjustment);
            item.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.LeftChest, Asset3Id, baseUrl + "/images/products/premium-tee.svg", "Company logo 鈥?left chest, ~8cm wide");
            order.AddItem(item);
            order.UpdateStatus(OrderStatus.Paid);
            await _orderRepository.InsertAsync(order, autoSave: true);
        }

        if (!existingOrderIds.Contains(Order6Id))
        {
            var variantS = FindVariant(premium, "White", "S");
            var variantM = FindVariant(premium, "Forest Green", "M");
            var order = new Order(Order6Id, "Wilson & Associates Ltd", "orders@wilsonassoc.co.nz",
                new ShippingAddress("Wilson & Associates Ltd", "Level 3, 90 Symonds Street",
                    "Grafton", "Auckland", "1023", "NZ",
                    phone: "+64 9 123 4567"))
            { Notes = "Company staff uniforms 鈥?urgent, need by Friday. Two colour variants.", CreationTime = now.AddDays(-6) };

            var itemA = new OrderItem(Item6aId, Order6Id,
                premium.Id, variantS.Id, premium.Name, $"{variantS.Color} / {variantS.Size}",
                3, premium.BasePrice + variantS.PriceAdjustment);
            itemA.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.LeftChest, Asset4Id, baseUrl + "/images/products/premium-tee.svg");
            order.AddItem(itemA);

            var itemB = new OrderItem(Item6bId, Order6Id,
                premium.Id, variantM.Id, premium.Name, $"{variantM.Color} / {variantM.Size}",
                2, premium.BasePrice + variantM.PriceAdjustment);
            itemB.UpsertPositionAsset(Guid.NewGuid(), PrintPosition.LeftChest);
            order.AddItem(itemB);

            await _orderRepository.InsertAsync(order, autoSave: true);
        }
    }
    private static ProductVariant FindVariant(Product product, string color, string size)
        => product.Variants.FirstOrDefault(v => v.Color == color && v.Size == size)
           ?? product.Variants.First();
}
