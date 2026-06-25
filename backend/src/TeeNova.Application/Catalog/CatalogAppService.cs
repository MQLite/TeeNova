using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TeeNova.Catalog.Dtos;
using TeeNova.Files;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Catalog;

public class CatalogAppService : ApplicationService, ICatalogAppService
{
    private readonly IRepository<Product, Guid>               _productRepository;
    private readonly IRepository<ProductVariant, Guid>        _variantRepository;
    private readonly IRepository<ProductImage, Guid>          _imageRepository;
    private readonly IRepository<ProductPriceTier, Guid>      _priceTierRepository;
    private readonly IRepository<PrintPricingGroup, Guid>          _printPricingGroupRepository;
    private readonly IRepository<ProductPrintPriceTier, Guid>      _printPriceTierRepository;
    private readonly IRepository<ProductPrintConfigOption, Guid>   _printConfigOptionRepository;
    private readonly IRepository<PrintConfig.PrintArea, Guid>      _printAreaRepository;
    private readonly IRepository<PrintConfig.PrintSize, Guid>      _printSizeRepository;
    private readonly PrintConfig.PrintConfigValidator             _printConfigValidator;
    private readonly IFileStorageService                          _fileStorageService;

    public CatalogAppService(
        IRepository<Product, Guid>                  productRepository,
        IRepository<ProductVariant, Guid>           variantRepository,
        IRepository<ProductImage, Guid>             imageRepository,
        IRepository<ProductPriceTier, Guid>         priceTierRepository,
        IRepository<PrintPricingGroup, Guid>        printPricingGroupRepository,
        IRepository<ProductPrintPriceTier, Guid>    printPriceTierRepository,
        IRepository<ProductPrintConfigOption, Guid> printConfigOptionRepository,
        IRepository<PrintConfig.PrintArea, Guid>    printAreaRepository,
        IRepository<PrintConfig.PrintSize, Guid>    printSizeRepository,
        PrintConfig.PrintConfigValidator            printConfigValidator,
        IFileStorageService                         fileStorageService)
    {
        _productRepository           = productRepository;
        _variantRepository           = variantRepository;
        _imageRepository             = imageRepository;
        _priceTierRepository         = priceTierRepository;
        _printPricingGroupRepository = printPricingGroupRepository;
        _printPriceTierRepository    = printPriceTierRepository;
        _printConfigOptionRepository = printConfigOptionRepository;
        _printAreaRepository         = printAreaRepository;
        _printSizeRepository         = printSizeRepository;
        _printConfigValidator        = printConfigValidator;
        _fileStorageService          = fileStorageService;
    }

    public async Task<PagedResultDto<ProductListItemDto>> GetListAsync(GetProductsInput input)
    {
        var query = await _productRepository.GetQueryableAsync();

        query = query
            .Include(p => p.Images)
            .Include(p => p.Variants);

        if (input.IsActive.HasValue)
            query = query.Where(p => p.IsActive == input.IsActive.Value);

        if (!string.IsNullOrWhiteSpace(input.ProductType))
            query = query.Where(p => p.ProductType == input.ProductType);

        if (!string.IsNullOrWhiteSpace(input.Search))
            query = query.Where(p => p.Name.Contains(input.Search));

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(p => p.Name)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        var dtos = ObjectMapper.Map<List<Product>, List<ProductListItemDto>>(items);

        // Compute the storefront "from" price (Jira 9203): fixed garment BasePrice plus the cheapest
        // active print-tier price across the product's PrintPricingGroup. Cheapest tier price across
        // print sizes is an honest, achievable printed-from price. Products with no group/active tiers
        // get FromPrice = null (the card falls back to the base garment price).
        var groupIds = items
            .Where(p => p.PrintPricingGroupId.HasValue)
            .Select(p => p.PrintPricingGroupId!.Value)
            .Distinct()
            .ToList();

        var cheapestTierByGroup = new Dictionary<Guid, decimal>();
        if (groupIds.Count > 0)
        {
            var activeGroupIds = (await _printPricingGroupRepository.GetListAsync(
                    g => groupIds.Contains(g.Id) && g.IsActive))
                .Select(g => g.Id)
                .ToList();

            var activeTiers = await _printPriceTierRepository.GetListAsync(
                t => activeGroupIds.Contains(t.PrintPricingGroupId) && t.IsActive);

            cheapestTierByGroup = activeTiers
                .GroupBy(t => t.PrintPricingGroupId)
                .ToDictionary(g => g.Key, g => g.Min(t => t.UnitPrintPrice));
        }

        foreach (var (dto, product) in dtos.Zip(items))
        {
            if (product.PrintPricingGroupId.HasValue
                && cheapestTierByGroup.TryGetValue(product.PrintPricingGroupId.Value, out var cheapestPrint))
            {
                dto.FromPrice     = product.BasePrice + cheapestPrint;
                dto.HasPriceTiers = true;
            }
            else
            {
                dto.FromPrice     = null;
                dto.HasPriceTiers = false;
            }
        }

        return new PagedResultDto<ProductListItemDto>(totalCount, dtos);
    }

    public async Task<ProductDto> GetAsync(Guid id)
    {
        var query = await _productRepository.GetQueryableAsync();

        var product = await query
            .Include(p => p.Variants.OrderBy(v => v.SortOrder))
            .Include(p => p.Images)
            .Include(p => p.PriceTiers)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Product), id);

        var dto = ObjectMapper.Map<Product, ProductDto>(product);

        // Legacy all-in tiers (DEPRECATED, inert): kept for back-compat display ordering only.
        dto.PriceTiers = dto.PriceTiers
            .OrderBy(t => t.ProductVariantId.HasValue)
            .ThenBy(t => t.ProductVariantId)
            .ThenBy(t => t.MinQuantity)
            .ToList();

        // Print-only tiers (Jira 9203) resolved from the product's group, ordered for readability.
        // GetAsync (GET /products/{id}) is public/anonymous, so expose ACTIVE rows only; inactive
        // admin rows must not leak to the storefront. Admin panels read the dedicated endpoints.
        dto.PrintPriceTiers = (await LoadGroupPrintTierDtosAsync(product.PrintPricingGroupId, requireActiveGroup: true))
            .Where(t => t.IsActive)
            .ToList();

        // Product/size scoped allowed print options (Jira 9204), active rows only (public-safe).
        dto.PrintConfigOptions = (await LoadPrintConfigOptionDtosAsync(product.Id))
            .Where(o => o.IsActive)
            .ToList();

        return dto;
    }

    /// <summary>Loads a product's scoped print options as DTOs (incl. inactive), ordered for display.</summary>
    private async Task<List<ProductPrintConfigOptionDto>> LoadPrintConfigOptionDtosAsync(Guid productId)
    {
        var options = await _printConfigOptionRepository.GetListAsync(o => o.ProductId == productId);

        return options
            .OrderBy(o => o.Size != null)   // product defaults first, then size overrides
            .ThenBy(o => o.Size)
            .ThenBy(o => o.SortOrder)
            .ThenBy(o => o.PrintAreaId)
            .ThenBy(o => o.PrintSizeId)
            .Select(o => ObjectMapper.Map<ProductPrintConfigOption, ProductPrintConfigOptionDto>(o))
            .ToList();
    }

    /// <summary>Loads a group's print price tiers as DTOs, ordered for readable display. Empty when ungrouped.</summary>
    private async Task<List<ProductPrintPriceTierDto>> LoadGroupPrintTierDtosAsync(
        Guid? groupId,
        bool requireActiveGroup = false)
    {
        if (groupId == null)
            return new List<ProductPrintPriceTierDto>();

        if (requireActiveGroup)
        {
            var group = await _printPricingGroupRepository.FindAsync(groupId.Value);
            if (group is not { IsActive: true })
                return new List<ProductPrintPriceTierDto>();
        }

        var tiers = await _printPriceTierRepository.GetListAsync(t => t.PrintPricingGroupId == groupId.Value);

        return tiers
            .OrderBy(t => t.Size != null)   // group defaults first, then size overrides
            .ThenBy(t => t.Size)
            .ThenBy(t => t.PrintSizeId)
            .ThenBy(t => t.MinQuantity)
            .Select(t => ObjectMapper.Map<ProductPrintPriceTier, ProductPrintPriceTierDto>(t))
            .ToList();
    }

    // Admin: Products

    public async Task<ProductDto> CreateAsync(CreateProductDto input)
    {
        await EnsurePrintPricingGroupValidAsync(input.PrintPricingGroupId);

        var product = new Product(GuidGenerator.Create(), input.Name, input.BasePrice, input.ProductType)
        {
            Description = input.Description,
            IsActive = input.IsActive,
            PrintPricingGroupId = input.PrintPricingGroupId,
        };

        await _productRepository.InsertAsync(product, autoSave: true);
        return await GetAsync(product.Id);
    }

    public async Task<ProductDto> UpdateAsync(Guid id, UpdateProductDto input)
    {
        await EnsurePrintPricingGroupValidAsync(input.PrintPricingGroupId);

        var product = await _productRepository.GetAsync(id);
        product.Name = input.Name;
        product.Description = input.Description;
        product.BasePrice = input.BasePrice;
        product.ProductType = input.ProductType;
        product.IsActive = input.IsActive;
        product.PrintPricingGroupId = input.PrintPricingGroupId;
        await _productRepository.UpdateAsync(product, autoSave: true);
        return await GetAsync(id);
    }

    public async Task<ProductDto> UpdateStatusAsync(Guid id, UpdateProductStatusDto input)
    {
        var product = await _productRepository.GetAsync(id);
        product.IsActive = input.IsActive;
        await _productRepository.UpdateAsync(product, autoSave: true);
        return await GetAsync(id);
    }

    public Task DeleteAsync(Guid id)
        => throw new NotImplementedException("CatalogAppService.DeleteAsync is not yet implemented.");

    // Admin: Images

    private static readonly string[] AllowedImageContentTypes =
        { "image/jpeg", "image/png", "image/webp" };

    private static readonly string[] AllowedImageExtensions =
        { ".jpg", ".jpeg", ".png", ".webp" };

    public async Task<ProductImageDto> UploadProductImageAsync(
        Guid productId,
        IFormFile file,
        CancellationToken cancellationToken = default)
    {
        // Validate product exists
        if (!await _productRepository.AnyAsync(p => p.Id == productId, cancellationToken))
            throw new EntityNotFoundException(typeof(Product), productId);

        // Validate file presence
        if (file == null || file.Length == 0)
            throw new UserFriendlyException("No file was provided or the file is empty.");

        // Validate content type
        if (!AllowedImageContentTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
            throw new UserFriendlyException(
                $"Unsupported file type '{file.ContentType}'. Allowed types: JPEG, PNG, WebP.");

        // Validate extension
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedImageExtensions.Contains(ext))
            throw new UserFriendlyException(
                $"Unsupported file extension '{ext}'. Allowed extensions: .jpg, .jpeg, .png, .webp.");

        // Persist file to the "products" folder
        string fileUrl;
        using (var stream = file.OpenReadStream())
        {
            fileUrl = await _fileStorageService.SaveAsync(
                stream,
                file.FileName,
                file.ContentType,
                folder: "products",
                fileNamePrefix: "product",
                cancellationToken: cancellationToken);
        }

        // Determine position within existing images for this product
        var existingCount = await _imageRepository.CountAsync(
            i => i.ProductId == productId, cancellationToken);

        var image = new ProductImage(
            GuidGenerator.Create(),
            productId,
            fileUrl,
            isPrimary: existingCount == 0)
        {
            SortOrder = existingCount,
        };

        await _imageRepository.InsertAsync(image, autoSave: true);
        return ObjectMapper.Map<ProductImage, ProductImageDto>(image);
    }

    public async Task<ProductImageDto> UpdateProductImageAsync(Guid productId, Guid imageId, UpdateProductImageDto input)
    {
        var image = await _imageRepository.GetAsync(imageId);

        if (image.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductImage), imageId);

        image.Color = string.IsNullOrWhiteSpace(input.Color) ? null : input.Color.Trim();
        await _imageRepository.UpdateAsync(image, autoSave: true);
        return ObjectMapper.Map<ProductImage, ProductImageDto>(image);
    }

    public async Task SetPrimaryProductImageAsync(Guid productId, Guid imageId)
    {
        var image = await _imageRepository.GetAsync(imageId);

        if (image.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductImage), imageId);

        var allImages = await _imageRepository.GetListAsync(i => i.ProductId == productId);
        for (var i = 0; i < allImages.Count; i++)
        {
            allImages[i].IsPrimary = allImages[i].Id == imageId;
            await _imageRepository.UpdateAsync(allImages[i], autoSave: i == allImages.Count - 1);
        }
    }

    public async Task DeleteProductImageAsync(Guid productId, Guid imageId)
    {
        var image = await _imageRepository.GetAsync(imageId);

        if (image.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductImage), imageId);

        var wasPrimary = image.IsPrimary;
        await _imageRepository.DeleteAsync(image, autoSave: true);

        if (wasPrimary)
        {
            var remaining = await _imageRepository.GetListAsync(i => i.ProductId == productId);
            var successor = remaining.OrderBy(i => i.SortOrder).FirstOrDefault();
            if (successor != null)
            {
                successor.IsPrimary = true;
                await _imageRepository.UpdateAsync(successor, autoSave: true);
            }
        }
    }

    // Admin: Variants

    public async Task<ProductVariantDto> CreateVariantAsync(Guid productId, CreateProductVariantDto input)
    {
        // Validate product exists
        if (!await _productRepository.AnyAsync(p => p.Id == productId))
            throw new EntityNotFoundException(typeof(Product), productId);

        // Prevent duplicate size/color combination under the same product
        var duplicateExists = await _variantRepository.AnyAsync(
            v => v.ProductId == productId &&
                 v.Size  == input.Size  &&
                 v.Color == input.Color);

        if (duplicateExists)
            throw new UserFriendlyException(
                $"A variant with size '{input.Size}' and color '{input.Color}' already exists for this product.");

        // Inventory is intentionally not set here; new variants default to
        // NotRecorded / null stock and are managed via UpdateVariantInventoryAsync.
        var variant = new ProductVariant(GuidGenerator.Create(), productId, input.Sku, input.Color, input.Size)
        {
            PriceAdjustment = input.PriceAdjustment,
            IsAvailable     = input.IsAvailable,
        };

        await _variantRepository.InsertAsync(variant, autoSave: true);
        return ObjectMapper.Map<ProductVariant, ProductVariantDto>(variant);
    }

    public async Task<ProductVariantDto> UpdateVariantAsync(Guid productId, Guid variantId, UpdateProductVariantDto input)
    {
        var variant = await _variantRepository.GetAsync(variantId);

        if (variant.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductVariant), variantId);

        // Prevent duplicate size/color; exclude the variant being updated
        var duplicateExists = await _variantRepository.AnyAsync(
            v => v.ProductId == productId &&
                 v.Size  == input.Size  &&
                 v.Color == input.Color &&
                 v.Id    != variantId);

        if (duplicateExists)
            throw new UserFriendlyException(
                $"A variant with size '{input.Size}' and color '{input.Color}' already exists for this product.");

        // Inventory fields are deliberately left untouched; they are owned by
        // UpdateVariantInventoryAsync so this flow can never clobber recorded inventory.
        variant.Sku             = input.Sku;
        variant.Color           = input.Color;
        variant.Size            = input.Size;
        variant.PriceAdjustment = input.PriceAdjustment;
        variant.IsAvailable     = input.IsAvailable;

        await _variantRepository.UpdateAsync(variant, autoSave: true);
        return ObjectMapper.Map<ProductVariant, ProductVariantDto>(variant);
    }

    public async Task DeleteVariantAsync(Guid productId, Guid variantId)
    {
        var variant = await _variantRepository.GetAsync(variantId);

        if (variant.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductVariant), variantId);

        await _variantRepository.DeleteAsync(variant, autoSave: true);
    }

    /// <summary>
    /// Records informational inventory against a variant (Jira 9002). Inventory is display-only:
    /// it never blocks checkout, hides the variant, or deducts stock. Sellability stays governed
    /// by <see cref="ProductVariant.IsAvailable"/>, which this method never touches.
    /// </summary>
    public async Task<ProductVariantDto> UpdateVariantInventoryAsync(
        Guid productId, Guid variantId, UpdateVariantInventoryDto input)
    {
        var variant = await _variantRepository.GetAsync(variantId);

        if (variant.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductVariant), variantId);

        if (!Enum.IsDefined(typeof(VariantInventoryStatus), input.InventoryStatus))
            throw new UserFriendlyException($"Invalid inventory status '{input.InventoryStatus}'.");

        if (input.StockQuantity is < 0)
            throw new UserFriendlyException("Stock quantity cannot be negative.");

        if (input.LowStockThreshold is < 0)
            throw new UserFriendlyException("Low stock threshold cannot be negative.");

        if (input.Note is { Length: > CatalogConsts.MaxInventoryNoteLength })
            throw new UserFriendlyException(
                $"Inventory note cannot exceed {CatalogConsts.MaxInventoryNoteLength} characters.");

        variant.InventoryStatus = input.InventoryStatus;

        // NotRecorded means "untracked"; quantity must always be cleared to null.
        variant.StockQuantity = input.InventoryStatus == VariantInventoryStatus.NotRecorded
            ? null
            : input.StockQuantity;

        variant.LowStockThreshold = input.LowStockThreshold;
        variant.InventoryNote     = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim();

        variant.InventoryUpdatedAt = Clock.Now;
        variant.InventoryUpdatedBy = CurrentUser?.UserName;

        await _variantRepository.UpdateAsync(variant, autoSave: true);
        return ObjectMapper.Map<ProductVariant, ProductVariantDto>(variant);
    }

    public async Task<List<ProductVariantDto>> BulkSaveVariantsAsync(
        Guid productId, BulkSaveProductVariantsDto input)
    {
        // Validate product exists
        if (!await _productRepository.AnyAsync(p => p.Id == productId))
            throw new EntityNotFoundException(typeof(Product), productId);

        // Detect duplicate size/color pairs within the payload
        var seenPairs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in input.Variants)
        {
            var pairKey = $"{item.Size.Trim()}|{item.Color.Trim()}";
            if (!seenPairs.Add(pairKey))
                throw new UserFriendlyException(
                    $"Duplicate size/color combination in request: '{item.Size.Trim()}' / '{item.Color.Trim()}'.");
        }

        // Collect IDs of existing variants explicitly kept in the new matrix
        var submittedIds = input.Variants
            .Where(v => v.Id.HasValue)
            .Select(v => v.Id!.Value)
            .ToList();

        // Load variants that are no longer in the matrix so we can delete them after the upsert
        var variantsToDelete = await _variantRepository.GetListAsync(
            v => v.ProductId == productId && !submittedIds.Contains(v.Id));

        // Process each item within the ABP unit of work (transaction).
        for (var index = 0; index < input.Variants.Count; index++)
        {
            var item = input.Variants[index];

            if (item.Id.HasValue)
            {
                // Update existing variant
                var variant = await _variantRepository.GetAsync(item.Id.Value);

                if (variant.ProductId != productId)
                    throw new EntityNotFoundException(typeof(ProductVariant), item.Id.Value);

                // Only run duplicate check when size or color has changed
                var sizeChanged  = !string.Equals(variant.Size,  item.Size,  StringComparison.Ordinal);
                var colorChanged = !string.Equals(variant.Color, item.Color, StringComparison.Ordinal);
                if (sizeChanged || colorChanged)
                {
                    var conflict = await _variantRepository.AnyAsync(
                        v => v.ProductId == productId &&
                             v.Size      == item.Size  &&
                             v.Color     == item.Color &&
                             v.Id        != item.Id.Value);
                    if (conflict)
                        throw new UserFriendlyException(
                            $"A variant with size '{item.Size}' and color '{item.Color}' already exists for this product.");
                }

                // Inventory left untouched; owned by UpdateVariantInventoryAsync.
                variant.Sku             = item.Sku;
                variant.Color           = item.Color;
                variant.Size            = item.Size;
                variant.PriceAdjustment = item.PriceAdjustment;
                variant.IsAvailable     = item.IsAvailable;
                variant.SortOrder       = index;

                await _variantRepository.UpdateAsync(variant, autoSave: true);
            }
            else
            {
                // Create new variant; check no existing size/color for this product.
                var duplicateExists = await _variantRepository.AnyAsync(
                    v => v.ProductId == productId &&
                         v.Size      == item.Size  &&
                         v.Color     == item.Color);

                if (duplicateExists)
                    throw new UserFriendlyException(
                        $"A variant with size '{item.Size}' and color '{item.Color}' already exists for this product.");

                // New variant: inventory defaults to NotRecorded / null stock.
                var variant = new ProductVariant(
                    GuidGenerator.Create(), productId, item.Sku, item.Color, item.Size)
                {
                    PriceAdjustment = item.PriceAdjustment,
                    IsAvailable     = item.IsAvailable,
                    SortOrder       = index,
                };

                await _variantRepository.InsertAsync(variant, autoSave: true);
            }
        }

        // Delete variants that were removed from the regenerated matrix
        foreach (var obsolete in variantsToDelete)
            await _variantRepository.DeleteAsync(obsolete, autoSave: true);

        // Return the full current variant list in admin-defined order
        var allVariants = (await _variantRepository.GetListAsync(v => v.ProductId == productId))
            .OrderBy(v => v.SortOrder)
            .ToList();
        return ObjectMapper.Map<List<ProductVariant>, List<ProductVariantDto>>(allVariants);
    }

    // Admin: Price Tiers (Jira 9102)

    /// <summary>
    /// Replaces the full set of quantity-break price tiers for a product (dedicated single-writer
    /// endpoint). Normal product update and variant matrix bulk-save deliberately never touch
    /// tiers, mirroring the inventory single-writer pattern. An empty list clears all tiers,
    /// reverting the product to the legacy additive formula.
    /// </summary>
    public async Task<ProductDto> SetPriceTiersAsync(Guid productId, SetProductPriceTiersDto input)
    {
        // Load the product with its variants so variant-override scopes can be validated.
        var query = await _productRepository.GetQueryableAsync();
        var product = await query
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == productId)
            ?? throw new EntityNotFoundException(typeof(Product), productId);

        var validVariantIds = product.Variants.Select(v => v.Id).ToHashSet();

        // Per-row validation
        foreach (var tier in input.Tiers)
        {
            if (tier.MinQuantity < 1)
                throw new UserFriendlyException("Tier minimum quantity must be at least 1.");

            if (tier.UnitPrice <= 0)
                throw new UserFriendlyException("Tier unit price must be greater than zero.");

            if (decimal.Round(tier.UnitPrice, 2) != tier.UnitPrice)
                throw new UserFriendlyException("Tier unit price cannot have more than 2 decimal places.");

            if (tier.ProductVariantId.HasValue && !validVariantIds.Contains(tier.ProductVariantId.Value))
                throw new UserFriendlyException(
                    $"Tier references a variant that does not belong to this product (id: {tier.ProductVariantId.Value}).");
        }

        // Per-scope validation (product-level set + each variant-override set)
        foreach (var scope in input.Tiers.GroupBy(t => t.ProductVariantId))
        {
            var minQuantities = scope.Select(t => t.MinQuantity).ToList();

            if (minQuantities.Count != minQuantities.Distinct().Count())
                throw new UserFriendlyException(
                    "Duplicate minimum quantities are not allowed within the same pricing scope.");

            // A MinQuantity == 1 row is required so every quantity of at least 1 resolves to a tier.
            if (!minQuantities.Contains(1))
                throw new UserFriendlyException(
                    "Each pricing scope must include a tier starting at minimum quantity 1.");
        }

        // Replace the full set for this product (all scopes)
        // Delete is flushed before the inserts so a re-used (scope, MinQuantity) does not collide
        // with the unique index within the same transaction. The ambient request unit of work
        // still wraps both phases atomically.
        var existing = await _priceTierRepository.GetListAsync(t => t.ProductId == productId);
        if (existing.Count > 0)
            await _priceTierRepository.DeleteManyAsync(existing, autoSave: true);

        foreach (var tier in input.Tiers)
        {
            await _priceTierRepository.InsertAsync(
                new ProductPriceTier(
                    GuidGenerator.Create(),
                    productId,
                    tier.ProductVariantId,
                    tier.MinQuantity,
                    tier.UnitPrice),
                autoSave: true);
        }

        return await GetAsync(productId);
    }

    // Admin: Print Pricing Groups (Jira 9203)

    public async Task<List<PrintPricingGroupDto>> GetPrintPricingGroupsAsync(bool? isActive = null)
    {
        var groups = await _printPricingGroupRepository.GetListAsync();
        var filtered = isActive.HasValue
            ? groups.Where(g => g.IsActive == isActive.Value)
            : groups;

        return filtered
            .OrderBy(g => g.SortOrder)
            .ThenBy(g => g.Name)
            .Select(g => ObjectMapper.Map<PrintPricingGroup, PrintPricingGroupDto>(g))
            .ToList();
    }

    public async Task<PrintPricingGroupDto> CreatePrintPricingGroupAsync(CreateUpdatePrintPricingGroupDto input)
    {
        var code = input.Code.Trim();
        if (await _printPricingGroupRepository.AnyAsync(g => g.Code == code))
            throw new UserFriendlyException($"A print pricing group with code '{code}' already exists.");

        var group = new PrintPricingGroup(GuidGenerator.Create(), input.Name.Trim(), code)
        {
            IsActive  = input.IsActive,
            SortOrder = input.SortOrder,
        };

        await _printPricingGroupRepository.InsertAsync(group, autoSave: true);
        return ObjectMapper.Map<PrintPricingGroup, PrintPricingGroupDto>(group);
    }

    public async Task<PrintPricingGroupDto> UpdatePrintPricingGroupAsync(
        Guid groupId, CreateUpdatePrintPricingGroupDto input)
    {
        var group = await _printPricingGroupRepository.GetAsync(groupId);

        var code = input.Code.Trim();
        if (await _printPricingGroupRepository.AnyAsync(g => g.Code == code && g.Id != groupId))
            throw new UserFriendlyException($"A print pricing group with code '{code}' already exists.");

        group.Name      = input.Name.Trim();
        group.Code      = code;
        group.IsActive  = input.IsActive;
        group.SortOrder = input.SortOrder;

        await _printPricingGroupRepository.UpdateAsync(group, autoSave: true);
        return ObjectMapper.Map<PrintPricingGroup, PrintPricingGroupDto>(group);
    }

    // Admin: Print Price Tiers (Jira 9203, group-scoped single-writer)

    public async Task<List<ProductPrintPriceTierDto>> GetPrintPriceTiersAsync(Guid groupId)
    {
        // Ensure the group exists (404 otherwise).
        await _printPricingGroupRepository.GetAsync(groupId);
        return await LoadGroupPrintTierDtosAsync(groupId);
    }

    /// <summary>
    /// Replaces the full set of print price tiers for a group (dedicated single-writer endpoint).
    /// Mirrors the price-tier replace pattern: never touches Product/Variant/inventory fields or the
    /// legacy ProductPriceTier rows. An empty list clears the group's print tiers (printing then
    /// falls back to PrintSize.BasePrice).
    /// </summary>
    public async Task<List<ProductPrintPriceTierDto>> SetPrintPriceTiersAsync(
        Guid groupId, SetProductPrintPriceTiersDto input)
    {
        var group = await _printPricingGroupRepository.GetAsync(groupId);
        if (!group.IsActive)
            throw new UserFriendlyException("Cannot set print price tiers on an inactive pricing group.");

        // Valid garment sizes = sizes of every variant of every product assigned to this group.
        var productIdsInGroup = (await _productRepository.GetListAsync(p => p.PrintPricingGroupId == groupId))
            .Select(p => p.Id)
            .ToHashSet();
        var groupSizes = productIdsInGroup.Count == 0
            ? new HashSet<string>(StringComparer.Ordinal)
            : (await _variantRepository.GetListAsync(v => productIdsInGroup.Contains(v.ProductId)))
                .Select(v => v.Size)
                .ToHashSet(StringComparer.Ordinal);

        // Validate referenced PrintSizes exist and are active (single batched load).
        var printSizeIds = input.Tiers.Select(t => t.PrintSizeId).Distinct().ToList();
        var printSizes = (await _printSizeRepository.GetListAsync(s => printSizeIds.Contains(s.Id)))
            .ToDictionary(s => s.Id);

        // Per-row validation
        foreach (var tier in input.Tiers)
        {
            if (tier.MinQuantity < 1)
                throw new UserFriendlyException("Tier minimum quantity must be at least 1.");

            if (tier.UnitPrintPrice <= 0)
                throw new UserFriendlyException("Tier unit print price must be greater than zero.");

            if (decimal.Round(tier.UnitPrintPrice, 2) != tier.UnitPrintPrice)
                throw new UserFriendlyException("Tier unit print price cannot have more than 2 decimal places.");

            if (!printSizes.TryGetValue(tier.PrintSizeId, out var printSize))
                throw new UserFriendlyException($"Tier references a print size that does not exist (id: {tier.PrintSizeId}).");

            if (!printSize.IsActive)
                throw new UserFriendlyException($"Tier references an inactive print size '{printSize.Name}'.");

            if (tier.Size != null && !groupSizes.Contains(tier.Size))
                throw new UserFriendlyException(
                    $"Size override '{tier.Size}' does not match any variant size of the products in this group.");
        }

        // Per-scope validation: (Size, PrintSizeId)
        foreach (var scope in input.Tiers.GroupBy(t => new { t.Size, t.PrintSizeId }))
        {
            var minQuantities = scope.Select(t => t.MinQuantity).ToList();

            if (minQuantities.Count != minQuantities.Distinct().Count())
                throw new UserFriendlyException(
                    "Duplicate minimum quantities are not allowed within the same size + print size scope.");

            if (!minQuantities.Contains(1))
                throw new UserFriendlyException(
                    "Each size + print size scope must include a tier starting at minimum quantity 1.");
        }

        // Replace the full set for this group
        // Delete flushed before inserts so a re-used natural key cannot collide with the unique index
        // inside the same transaction (same approach as legacy price tiers).
        var existing = await _printPriceTierRepository.GetListAsync(t => t.PrintPricingGroupId == groupId);
        if (existing.Count > 0)
            await _printPriceTierRepository.DeleteManyAsync(existing, autoSave: true);

        foreach (var tier in input.Tiers)
        {
            await _printPriceTierRepository.InsertAsync(
                new ProductPrintPriceTier(
                    GuidGenerator.Create(),
                    groupId,
                    tier.Size,
                    tier.PrintSizeId,
                    tier.MinQuantity,
                    tier.UnitPrintPrice,
                    tier.IsActive,
                    tier.SortOrder),
                autoSave: true);
        }

        return await LoadGroupPrintTierDtosAsync(groupId);
    }

    /// <summary>Throws when a non-null PrintPricingGroupId does not reference an existing group.</summary>
    private async Task EnsurePrintPricingGroupValidAsync(Guid? groupId)
    {
        if (groupId == null)
            return;

        if (!await _printPricingGroupRepository.AnyAsync(g => g.Id == groupId.Value))
            throw new UserFriendlyException("The selected print pricing group does not exist.");
    }

    // Admin: Print Config Options (Jira 9204, product-scoped single-writer)

    public async Task<List<ProductPrintConfigOptionDto>> GetPrintConfigOptionsAsync(Guid productId)
    {
        if (!await _productRepository.AnyAsync(p => p.Id == productId))
            throw new EntityNotFoundException(typeof(Product), productId);

        return await LoadPrintConfigOptionDtosAsync(productId);
    }

    /// <summary>
    /// Replaces the full set of product/size scoped allowed print options (dedicated single-writer
    /// endpoint). Never touches Product/Variant/inventory fields, price tiers, group assignment, or
    /// the legacy ProductPriceTier rows. An empty list clears scoped options (the product reverts to
    /// the global PrintAreaSizeOption matrix). Selectability only; no effect on price.
    /// </summary>
    public async Task<List<ProductPrintConfigOptionDto>> SetPrintConfigOptionsAsync(
        Guid productId, SetProductPrintConfigOptionsDto input)
    {
        var query = await _productRepository.GetQueryableAsync();
        var product = await query
            .Include(p => p.Variants)
            .FirstOrDefaultAsync(p => p.Id == productId)
            ?? throw new EntityNotFoundException(typeof(Product), productId);

        var validSizes = product.Variants.Select(v => v.Size).ToHashSet(StringComparer.Ordinal);

        // Batched load of referenced PrintAreas / PrintSizes for existence + active checks.
        var areaIds = input.Options.Select(o => o.PrintAreaId).Distinct().ToList();
        var sizeIds = input.Options.Select(o => o.PrintSizeId).Distinct().ToList();
        var areas = (await _printAreaRepository.GetListAsync(a => areaIds.Contains(a.Id))).ToDictionary(a => a.Id);
        var sizes = (await _printSizeRepository.GetListAsync(s => sizeIds.Contains(s.Id))).ToDictionary(s => s.Id);

        // Per-row validation
        var globalPairs = new List<(PrintConfig.PrintArea Area, PrintConfig.PrintSize Size)>();
        foreach (var opt in input.Options)
        {
            if (opt.Size != null && !validSizes.Contains(opt.Size))
                throw new UserFriendlyException(
                    $"Size override '{opt.Size}' does not match any variant size of this product.");

            if (!areas.TryGetValue(opt.PrintAreaId, out var area))
                throw new UserFriendlyException($"Print area does not exist (id: {opt.PrintAreaId}).");
            if (!area.IsActive)
                throw new UserFriendlyException($"Print area '{area.Name}' is inactive.");

            if (!sizes.TryGetValue(opt.PrintSizeId, out var size))
                throw new UserFriendlyException($"Print size does not exist (id: {opt.PrintSizeId}).");
            if (!size.IsActive)
                throw new UserFriendlyException($"Print size '{size.Name}' is inactive.");

            globalPairs.Add((area, size));
        }

        // Each (PrintArea, PrintSize) must be valid in the active global PrintAreaSizeOption matrix.
        await _printConfigValidator.ValidatePrintCombinationsAsync(globalPairs);

        // No duplicate (Size, PrintAreaId, PrintSizeId) rows in the payload.
        var seen = new HashSet<string>();
        foreach (var opt in input.Options)
        {
            var key = $"{opt.Size ?? "\0"}|{opt.PrintAreaId}|{opt.PrintSizeId}";
            if (!seen.Add(key))
                throw new UserFriendlyException(
                    "Duplicate (size, print area, print size) options are not allowed.");
        }

        // Replace the full set for this product
        // Delete flushed before inserts so a re-used natural key cannot collide with the unique index
        // inside the same transaction.
        var existing = await _printConfigOptionRepository.GetListAsync(o => o.ProductId == productId);
        if (existing.Count > 0)
            await _printConfigOptionRepository.DeleteManyAsync(existing, autoSave: true);

        foreach (var opt in input.Options)
        {
            await _printConfigOptionRepository.InsertAsync(
                new ProductPrintConfigOption(
                    GuidGenerator.Create(),
                    productId,
                    opt.Size,
                    opt.PrintAreaId,
                    opt.PrintSizeId,
                    opt.IsActive,
                    opt.SortOrder),
                autoSave: true);
        }

        return await LoadPrintConfigOptionDtosAsync(productId);
    }
}
